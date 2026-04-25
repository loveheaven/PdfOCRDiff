/**
 * useEditorStore — pure UI state for the editable text panel.
 *
 * Only used in non-project mode (no .ocrdiff persistence).
 * Handles: per-page text, dirty state, auto-save version creation.
 *
 * In project mode, useOcrDiffProject handles all of the above.
 */

import { useState, useCallback, useRef, useEffect } from "react";

export interface TextVersion {
  version: number;
  text: string;
  modified_at: string;
}

interface PageState {
  text: string;
  dirty: boolean;
  versions: TextVersion[];
  nextVersion: number;
}

interface UseEditorStoreReturn {
  getText: (page: number) => string;
  setText: (page: number, text: string) => void;
  initPage: (page: number, ocrText: string) => void;
  save: (page: number) => void;
  isDirty: (page: number) => boolean;
  getVersions: (page: number) => TextVersion[];
  getCurrentVersion: (page: number) => number;
  restoreVersion: (page: number, version: number) => void;
}

const AUTO_SAVE_INTERVAL_MS = 10 * 1000;

export function useEditorStore(): UseEditorStoreReturn {
  const [store, setStore] = useState<Map<number, PageState>>(new Map());
  const storeRef = useRef(store);
  storeRef.current = store;

  const getOrCreate = useCallback((page: number): PageState => {
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
      const v: TextVersion = { version: 1, text: ocrText, modified_at: new Date().toISOString() };
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
      const v: TextVersion = { version: ps.nextVersion, text: ps.text, modified_at: new Date().toISOString() };
      next.set(page, {
        ...ps,
        dirty: false,
        versions: [v, ...ps.versions],
        nextVersion: ps.nextVersion + 1,
      });
      return next;
    });
  }, []);

  const isDirty = useCallback((page: number): boolean => {
    return getOrCreate(page).dirty;
  }, [getOrCreate]);

  const getVersions = useCallback((page: number): TextVersion[] => {
    return getOrCreate(page).versions;
  }, [getOrCreate]);

  const getCurrentVersion = useCallback((page: number): number => {
    const ps = getOrCreate(page);
    return ps.versions.length > 0 ? ps.versions[0].version : 0;
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

  // Auto-save: create new version for any dirty page
  useEffect(() => {
    const interval = setInterval(() => {
      const s = storeRef.current;
      let changed = false;
      const next = new Map(s);
      for (const [page, ps] of s) {
        if (ps.dirty) {
          const v: TextVersion = { version: ps.nextVersion, text: ps.text, modified_at: new Date().toISOString() };
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
    }, AUTO_SAVE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  return {
    getText,
    setText,
    initPage,
    save,
    isDirty,
    getVersions,
    getCurrentVersion,
    restoreVersion,
  };
}
