import { useState, useCallback } from "react";
import { getBackendUrl } from "../config";

export interface EpubChapter {
  title: string;
  text: string;
}

interface UseEpubReturn {
  chapters: EpubChapter[];
  isLoading: boolean;
  error: string | null;
  uploadEpub: (file: File) => Promise<void>;
  reset: () => void;
}

export function useEpub(): UseEpubReturn {
  const [chapters, setChapters] = useState<EpubChapter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setChapters([]);
    setIsLoading(false);
    setError(null);
  }, []);

  const uploadEpub = useCallback(async (file: File) => {
    reset();
    setIsLoading(true);

    const backendUrl = getBackendUrl();

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${backendUrl}/epub/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`EPUB upload failed: ${res.statusText}`);
      }

      const { chapters } = await res.json();
      setChapters(chapters);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [reset]);

  return { chapters, isLoading, error, uploadEpub, reset };
}
