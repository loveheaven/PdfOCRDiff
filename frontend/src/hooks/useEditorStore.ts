import { useState, useCallback, useRef, useEffect } from "react";
import { getAutoSaveInterval } from "../config";

export interface TextVersion {
  version: number;
  text: string;
  timestamp: number; // Date.now()
}

/**
 * Stores per-page editable text with auto-save and version history.
 * Key = page number.
 */
interface PageStore {
  /** Current (possibly edited) text */
  text: string;
  /** Whether text has been modified since last save */
  dirty: boolean;
  /** Saved versions (newest first) */
  versions: TextVersion[];
  /** Next version number */
  nextVersion: number;
}

interface UseEditorStoreReturn {
  /** Get the editable text for a page */
  getText: (page: number) => string;
  /** Update text for a page (marks dirty) */
  setText: (page: number, text: string) => void;
  /** Initialize a page with OCR text (only if not already present) */
  initPage: (page: number, ocrText: string) => void;
  /** Manually save current page */
  save: (page: number) => void;
  /** Get version history for a page */
  getVersions: (page: number) => TextVersion[];
  /** Restore a specific version */
  restoreVersion: (page: number, version: number) => void;
  /** Current version number for a page */
  getCurrentVersion: (page: number) => number;
  /** Whether a page has unsaved changes */
  isDirty: (page: number) => boolean;
}

export function useEditorStore(): UseEditorStoreReturn {
  const [store, setStore] = useState<Map<number, PageStore>>(new Map());
  const storeRef = useRef(store);
  storeRef.current = store;

  const getOrCreate = useCallback((page: number): PageStore => {
    return storeRef.current.get(page) || {
      text: "",
      dirty: false,
      versions: [],
      nextVersion: 1,
    };
  }, []);

  const getText = useCallback((page: number): string => {
    return getOrCreate(page).text;
  }, [getOrCreate]);

  const setText = useCallback((page: number, text: string) => {
    setStore((prev) => {
      const next = new Map(prev);
      const ps = next.get(page) || { text: "", dirty: false, versions: [], nextVersion: 1 };
      next.set(page, { ...ps, text, dirty: true });
      return next;
    });
  }, []);

  const initPage = useCallback((page: number, ocrText: string) => {
    setStore((prev) => {
      if (prev.has(page)) return prev; // don't overwrite edits
      const next = new Map(prev);
      const v: TextVersion = { version: 1, text: ocrText, timestamp: Date.now() };
      next.set(page, {
        text: ocrText,
        dirty: false,
        versions: [v],
        nextVersion: 2,
      });
      return next;
    });
  }, []);

  const save = useCallback((page: number) => {
    setStore((prev) => {
      const ps = prev.get(page);
      if (!ps || !ps.dirty) return prev;
      const next = new Map(prev);
      const v: TextVersion = { version: ps.nextVersion, text: ps.text, timestamp: Date.now() };
      next.set(page, {
        ...ps,
        dirty: false,
        versions: [v, ...ps.versions],
        nextVersion: ps.nextVersion + 1,
      });
      return next;
    });
  }, []);

  const getVersions = useCallback((page: number): TextVersion[] => {
    return getOrCreate(page).versions;
  }, [getOrCreate]);

  const restoreVersion = useCallback((page: number, version: number) => {
    setStore((prev) => {
      const ps = prev.get(page);
      if (!ps) return prev;
      const v = ps.versions.find((vv) => vv.version === version);
      if (!v) return prev;
      const next = new Map(prev);
      next.set(page, { ...ps, text: v.text, dirty: true });
      return next;
    });
  }, []);

  const getCurrentVersion = useCallback((page: number): number => {
    const ps = getOrCreate(page);
    return ps.versions.length > 0 ? ps.versions[0].version : 0;
  }, [getOrCreate]);

  const isDirty = useCallback((page: number): boolean => {
    return getOrCreate(page).dirty;
  }, [getOrCreate]);

  // ---------- Auto-save timer ----------
  useEffect(() => {
    const interval = setInterval(() => {
      const s = storeRef.current;
      let changed = false;
      const next = new Map(s);
      for (const [page, ps] of s) {
        if (ps.dirty) {
          const v: TextVersion = { version: ps.nextVersion, text: ps.text, timestamp: Date.now() };
          next.set(page, {
            ...ps,
            dirty: false,
            versions: [v, ...ps.versions],
            nextVersion: ps.nextVersion + 1,
          });
          changed = true;
        }
      }
      if (changed) setStore(next);
    }, getAutoSaveInterval() * 1000);

    return () => clearInterval(interval);
  }, []);

  return {
    getText,
    setText,
    initPage,
    save,
    getVersions,
    restoreVersion,
    getCurrentVersion,
    isDirty,
  };
}
