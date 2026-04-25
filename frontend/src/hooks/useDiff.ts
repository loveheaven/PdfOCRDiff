import { useState, useCallback } from "react";
import DiffMatchPatch from "diff-match-patch";

export interface DiffSegment {
  type: "equal" | "delete" | "insert" | "replace";
  text?: string;
  text_a?: string;
  text_b?: string;
}

interface UseDiffReturn {
  diffs: DiffSegment[];
  isComputing: boolean;
  computeDiff: (textA: string, textB: string) => void;
  reset: () => void;
}

const dmp = new DiffMatchPatch();

/**
 * Compute character-level diff entirely in the browser using diff-match-patch.
 * No backend needed.
 */
export function useDiff(): UseDiffReturn {
  const [diffs, setDiffs] = useState<DiffSegment[]>([]);
  const [isComputing, setIsComputing] = useState(false);

  const reset = useCallback(() => {
    setDiffs([]);
    setIsComputing(false);
  }, []);

  const computeDiff = useCallback((textA: string, textB: string) => {
    setIsComputing(true);

    try {
      const rawDiffs = dmp.diff_main(textA, textB);
      dmp.diff_cleanupSemantic(rawDiffs);

      const segments: DiffSegment[] = [];
      let i = 0;

      while (i < rawDiffs.length) {
        const [op, text] = rawDiffs[i];

        if (op === 0) {
          // Equal
          segments.push({ type: "equal", text });
          i++;
        } else if (op === -1 && i + 1 < rawDiffs.length && rawDiffs[i + 1][0] === 1) {
          // Delete followed by Insert → Replace
          segments.push({ type: "replace", text_a: text, text_b: rawDiffs[i + 1][1] });
          i += 2;
        } else if (op === -1) {
          // Delete only
          segments.push({ type: "delete", text });
          i++;
        } else if (op === 1) {
          // Insert only
          segments.push({ type: "insert", text });
          i++;
        } else {
          i++;
        }
      }

      setDiffs(segments);
    } catch {
      setDiffs([]);
    } finally {
      setIsComputing(false);
    }
  }, []);

  return { diffs, isComputing, computeDiff, reset };
}
