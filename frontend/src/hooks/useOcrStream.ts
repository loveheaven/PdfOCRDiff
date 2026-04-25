import { useState, useCallback, useRef } from "react";
import { getBackendUrl } from "../config";

export interface OcrPageResult {
  page: number;
  total_pages: number;
  image: string; // base64 data URI
  text: string;
  boxes: number[][];
  scores: number[];
}

export type OcrStatus = "idle" | "processing" | "paused" | "done";

interface UseOcrStreamReturn {
  /** All received page results, keyed by page number */
  pages: Map<number, OcrPageResult>;
  currentPage: number;
  totalPages: number;
  completedCount: number;
  status: OcrStatus;
  error: string | null;
  uploadAndStart: (file: File) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  setCurrentPage: (page: number) => void;
  reset: () => void;
}

export function useOcrStream(): UseOcrStreamReturn {
  const [pages, setPages] = useState<Map<number, OcrPageResult>>(new Map());
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [status, setStatus] = useState<OcrStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const taskIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    taskIdRef.current = null;
    setPages(new Map());
    setCurrentPage(0);
    setTotalPages(0);
    setCompletedCount(0);
    setStatus("idle");
    setError(null);
  }, []);

  /** Connect to SSE and consume page results */
  const connectStream = useCallback(async (taskId: string, startPage: number) => {
    const backendUrl = getBackendUrl();
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const response = await fetch(
        `${backendUrl}/ocr/stream/${taskId}?start_page=${startPage}`,
        { signal: abort.signal }
      );

      if (!response.ok || !response.body) {
        throw new Error("Failed to connect to OCR stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);

            if (data.done) {
              setStatus("done");
              setCompletedCount(data.completed ?? 0);
              return;
            }

            if (data.paused) {
              setStatus("paused");
              setCompletedCount(data.completed ?? 0);
              return;
            }

            // Normal page result
            const pageResult: OcrPageResult = data;
            setPages((prev) => {
              const next = new Map(prev);
              next.set(pageResult.page, pageResult);
              return next;
            });
            setCurrentPage(pageResult.page);
            setCompletedCount((prev) => prev + 1);
          } catch {
            // skip malformed JSON
          }
        }
      }

      // Stream ended without explicit done/paused
      setStatus((prev) => (prev === "processing" ? "done" : prev));
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("idle");
    }
  }, []);

  const uploadAndStart = useCallback(async (file: File) => {
    reset();
    setStatus("processing");
    setError(null);

    const backendUrl = getBackendUrl();

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch(`${backendUrl}/ocr/upload`, {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.statusText}`);
      }

      const { task_id, total_pages } = await uploadRes.json();
      taskIdRef.current = task_id;
      setTotalPages(total_pages);

      await connectStream(task_id, 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("idle");
    }
  }, [reset, connectStream]);

  const pause = useCallback(async () => {
    const taskId = taskIdRef.current;
    if (!taskId) return;

    const backendUrl = getBackendUrl();
    try {
      // Abort current SSE connection
      abortRef.current?.abort();

      const res = await fetch(`${backendUrl}/ocr/pause/${taskId}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setStatus("paused");
        setCompletedCount(data.completed);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Pause failed");
    }
  }, []);

  const resume = useCallback(async () => {
    const taskId = taskIdRef.current;
    if (!taskId) return;

    const backendUrl = getBackendUrl();
    try {
      const res = await fetch(`${backendUrl}/ocr/resume/${taskId}`, { method: "POST" });
      if (!res.ok) throw new Error("Resume failed");

      const data = await res.json();
      setStatus("processing");
      setCompletedCount(data.completed);

      // Reconnect SSE stream from where we left off
      await connectStream(taskId, data.completed);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Resume failed");
    }
  }, [connectStream]);

  return {
    pages,
    currentPage,
    totalPages,
    completedCount,
    status,
    error,
    uploadAndStart,
    pause,
    resume,
    setCurrentPage,
    reset,
  };
}
