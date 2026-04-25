import { useState, useCallback } from "react";
import { getBackendUrl } from "../config";

export interface DiffSegment {
  type: "equal" | "delete" | "insert" | "replace";
  text?: string;
  text_a?: string;
  text_b?: string;
}

interface UseDiffReturn {
  diffs: DiffSegment[];
  isComputing: boolean;
  computeDiff: (textA: string, textB: string) => Promise<void>;
  reset: () => void;
}

export function useDiff(): UseDiffReturn {
  const [diffs, setDiffs] = useState<DiffSegment[]>([]);
  const [isComputing, setIsComputing] = useState(false);

  const reset = useCallback(() => {
    setDiffs([]);
    setIsComputing(false);
  }, []);

  const computeDiff = useCallback(async (textA: string, textB: string) => {
    setIsComputing(true);
    const backendUrl = getBackendUrl();

    try {
      const res = await fetch(`${backendUrl}/diff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text_a: textA, text_b: textB }),
      });

      if (!res.ok) {
        throw new Error(`Diff failed: ${res.statusText}`);
      }

      const { diffs } = await res.json();
      setDiffs(diffs);
    } catch {
      setDiffs([]);
    } finally {
      setIsComputing(false);
    }
  }, []);

  return { diffs, isComputing, computeDiff, reset };
}
