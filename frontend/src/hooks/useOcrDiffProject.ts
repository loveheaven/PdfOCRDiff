/**
 * useOcrDiffProject — manages .ocrdiff project lifecycle using IndexedDB.
 *
 * Responsibilities:
 * - Create .ocrdiff project in IndexedDB when remote OCR starts
 * - Save page images as blobs as they arrive from SSE
 * - Pending text management: in-memory unsaved changes per page
 * - Auto-save timer: flushes pending edits to manifest.edits (version creation only on save)
 * - Version history via manifest.edits (append-only)
 * - Load existing project from IndexedDB or zip import
 * - Export to .ocrdiff.zip for sharing via browser download
 */

import { useState, useCallback, useRef, useEffect } from "react";
import JSZip from "jszip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OcrPageBase {
  page: number;
  image: string;
  text: string;
  boxes: number[][];
  scores: number[];
}

export interface OcrEdit {
  page: number;
  text: string;
  version: number;
  modified_at: string;
}

export interface TextVersion {
  version: number;
  text: string;
  modified_at: string;
}

export interface OcrDiffManifest {
  ocrdiff_version: number;
  pdf_name: string;
  dpi: number;
  source: "remote_stream" | "local_cli" | "imported";
  total_pages: number;
  created_at: string;
  base: {
    pages: OcrPageBase[];
  };
  edits: OcrEdit[];
}

export interface OcrPageResult {
  page: number;
  total_pages: number;
  image: string;
  text: string;
  boxes: number[][];
  scores: number[];
}

interface UseOcrDiffProjectReturn {
  projectPath: string | null;
  manifest: OcrDiffManifest | null;
  pages: Map<number, OcrPageResult>;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  hasProject: boolean;
  hasManifest: boolean;

  createProject: (pdfName: string, totalPages: number, dpi?: number) => Promise<string>;
  savePageImage: (pageNum: number, base64DataUri: string) => Promise<void>;
  addBasePage: (page: OcrPageBase) => void;
  updatePendingText: (page: number, text: string) => void;
  save: (page: number) => void;
  saveAll: () => Promise<void>;
  isDirty: (page: number) => boolean;
  getVersions: (page: number) => TextVersion[];
  restoreVersion: (page: number, version: number) => void;
  getPageText: (page: number) => string;
  getPageVersion: (page: number) => number;
  loadProject: (folderPath?: string) => Promise<void>;
  loadZipFile: (file: File) => Promise<void>;
  exportZip: () => Promise<void>;
  closeProject: () => void;
}

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

const DB_NAME = "ocrdiff_db";
const DB_VERSION = 1;
const STORE_PAGES = "pages";
const STORE_MANIFEST = "manifest";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PAGES)) {
        db.createObjectStore(STORE_PAGES, { keyPath: "projectPath_page" });
      }
      if (!db.objectStoreNames.contains(STORE_MANIFEST)) {
        db.createObjectStore(STORE_MANIFEST, { keyPath: "projectPath" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(store: string, value: unknown, key?: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    const req = key ? os.put(value, key) : os.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    db.close();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dataUriToBytes(dataUri: string): Uint8Array {
  const b64 = dataUri.split(",", 2)[1];
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function dataUriToBlob(dataUri: string): Blob {
  return new Blob([dataUriToBytes(dataUri)], { type: "image/png" });
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getBaseText(manifest: OcrDiffManifest, pageNum: number): string {
  return manifest.base.pages.find((p) => p.page === pageNum)?.text ?? "";
}

function getLatestEditText(manifest: OcrDiffManifest, pageNum: number): string {
  const pageEdits = manifest.edits.filter((e) => e.page === pageNum);
  if (pageEdits.length === 0) return getBaseText(manifest, pageNum);
  return pageEdits.reduce((a, b) => (a.version > b.version ? a : b)).text;
}

function getPageEditVersion(manifest: OcrDiffManifest, pageNum: number): number {
  const pageEdits = manifest.edits.filter((e) => e.page === pageNum);
  if (pageEdits.length === 0) return 1;
  return Math.max(...pageEdits.map((e) => e.version));
}

function buildPagesMap(
  manifest: OcrDiffManifest,
  pageImages: Map<number, string>,
  pendingText: Map<number, string>,
): Map<number, OcrPageResult> {
  const map = new Map<number, OcrPageResult>();
  for (const basePage of manifest.base.pages) {
    const pending = pendingText.get(basePage.page);
    const text = pending ?? getLatestEditText(manifest, basePage.page);
    map.set(basePage.page, {
      page: basePage.page,
      total_pages: manifest.total_pages,
      image: pageImages.get(basePage.page) ?? "",
      text,
      boxes: basePage.boxes,
      scores: basePage.scores,
    });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOcrDiffProject(): UseOcrDiffProjectReturn {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [manifest, setManifest] = useState<OcrDiffManifest | null>(null);
  const [pages, setPages] = useState<Map<number, OcrPageResult>>(new Map());
  const [pageImages, setPageImages] = useState<Map<number, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pending unsaved text changes (in-memory only)
  const pendingTextRef = useRef<Map<number, string>>(new Map());
  const [pendingText, setPendingText] = useState<Map<number, string>>(new Map());

  const manifestRef = useRef<OcrDiffManifest | null>(null);
  const projectPathRef = useRef<string | null>(null);
  const pageImagesRef = useRef<Map<number, string>>(new Map());
  const pendingTextRefCopy = pendingTextRef;
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  manifestRef.current = manifest;
  projectPathRef.current = projectPath;
  pageImagesRef.current = pageImages;

  // Rebuild pages map when manifest, images, or pending text changes
  useEffect(() => {
    if (!manifest) return;
    setPages(buildPagesMap(manifest, pageImages, pendingText));
  }, [manifest, pageImages, pendingText]);

  // ---- Flush pending edits to manifest.edits ----
  const flushPendingEdits = useCallback(() => {
    const pending = pendingTextRefCopy.current;
    if (pending.size === 0) return;

    setManifest((prev) => {
      if (!prev) return prev;
      let next = prev;
      for (const [pageNum, text] of pending) {
        const lastVersion = getPageEditVersion(next, pageNum);
        const newEdit: OcrEdit = {
          page: pageNum,
          text,
          version: lastVersion + 1,
          modified_at: new Date().toISOString(),
        };
        next = {
          ...next,
          edits: [...next.edits.filter((e) => e.page !== pageNum), newEdit],
        };
      }
      return next;
    });

    pendingTextRefCopy.current = new Map();
    setPendingText(new Map());
  }, []);

  // ---- Auto-save timer ----
  useEffect(() => {
    if (!projectPath) {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }

    const intervalSec = 10;
    autoSaveTimerRef.current = setInterval(async () => {
      if (pendingTextRefCopy.current.size === 0 || !projectPathRef.current || !manifestRef.current) return;
      try {
        setIsSaving(true);
        flushPendingEdits();
        const currentManifest = manifestRef.current;
        if (currentManifest) {
          await dbPut(STORE_MANIFEST, { projectPath: projectPathRef.current, ...currentManifest }, projectPathRef.current);
        }
      } catch (err) {
        console.error("Auto-save failed:", err);
      } finally {
        setIsSaving(false);
      }
    }, intervalSec * 1000);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [projectPath, flushPendingEdits]);

  // ---- Create project ----
  const createProject = useCallback(async (pdfName: string, totalPages: number, dpi = 200): Promise<string> => {
    setError(null);
    setIsLoading(true);
    try {
      const safeName = pdfName.replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9_\u4e00-\u9fff-]/g, "_");
      const folderName = `${safeName}_${Date.now()}`;
      const newManifest: OcrDiffManifest = {
        ocrdiff_version: 1,
        pdf_name: pdfName,
        dpi,
        source: "remote_stream",
        total_pages: totalPages,
        created_at: new Date().toISOString(),
        base: { pages: [] },
        edits: [],
      };

      await dbPut(STORE_MANIFEST, { projectPath: folderName, ...newManifest }, folderName);
      setProjectPath(folderName);
      setManifest(newManifest);
      setPageImages(new Map());
      pendingTextRef.current = new Map();
      setPendingText(new Map());
      return folderName;
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建项目失败");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ---- Save page image ----
  const savePageImage = useCallback(async (pageNum: number, base64DataUri: string) => {
    if (!projectPathRef.current) return;
    const pageKey = `${projectPathRef.current}_page_${pageNum}`;
    const blob = dataUriToBlob(base64DataUri);
    try {
      await dbPut(STORE_PAGES, { projectPath_page: pageKey, blob });
      const dataUri = await blobToDataUri(blob);
      pageImagesRef.current.set(pageNum, dataUri);
      setPageImages(new Map(pageImagesRef.current));
    } catch (err) {
      console.error("Failed to save page image:", err);
    }
  }, []);

  // ---- Add base page to manifest ----
  const addBasePage = useCallback((page: OcrPageBase) => {
    setManifest((prev) => {
      if (!prev) return prev;
      return { ...prev, base: { pages: [...prev.base.pages, page] } };
    });
  }, []);

  // ---- Update pending text (called on every keystroke) ----
  const updatePendingText = useCallback((page: number, text: string) => {
    pendingTextRef.current.set(page, text);
    setPendingText(new Map(pendingTextRef.current));
  }, []);

  // ---- Save a page (flush its pending text as a new edit version) ----
  const save = useCallback((page: number) => {
    const text = pendingTextRef.current.get(page);
    if (text === undefined) return;

    setManifest((prev) => {
      if (!prev) return prev;
      const lastVersion = getPageEditVersion(prev, page);
      const newEdit: OcrEdit = {
        page,
        text,
        version: lastVersion + 1,
        modified_at: new Date().toISOString(),
      };
      return {
        ...prev,
        edits: [...prev.edits.filter((e) => e.page !== page), newEdit],
      };
    });

    pendingTextRef.current.delete(page);
    setPendingText(new Map(pendingTextRef.current));
  }, []);

  // ---- Save all pending edits and persist manifest ----
  const saveAll = useCallback(async () => {
    if (!projectPath || !manifest) return;
    setIsSaving(true);
    try {
      flushPendingEdits();
      const currentManifest = manifestRef.current;
      if (currentManifest) {
        await dbPut(STORE_MANIFEST, { projectPath, ...currentManifest }, projectPath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setIsSaving(false);
    }
  }, [projectPath, manifest, flushPendingEdits]);

  // ---- Check if page has pending changes ----
  const isDirty = useCallback((page: number): boolean => {
    return pendingTextRef.current.has(page);
  }, []);

  // ---- Get version history for a page ----
  const getVersions = useCallback((page: number): TextVersion[] => {
    if (!manifest) return [];
    return manifest.edits
      .filter((e) => e.page === page)
      .map((e) => ({ version: e.version, text: e.text, modified_at: e.modified_at }));
  }, [manifest]);

  // ---- Restore a specific version (set as pending text) ----
  const restoreVersion = useCallback((page: number, version: number) => {
    if (!manifest) return;
    const edit = manifest.edits.find((e) => e.page === page && e.version === version);
    if (!edit) return;
    pendingTextRef.current.set(page, edit.text);
    setPendingText(new Map(pendingTextRef.current));
  }, [manifest]);

  // ---- Get current text for a page ----
  const getPageText = useCallback((page: number): string => {
    if (!manifest) return "";
    const pending = pendingTextRef.current.get(page);
    if (pending !== undefined) return pending;
    return getLatestEditText(manifest, page);
  }, [manifest]);

  // ---- Get current version number for a page ----
  const getPageVersion = useCallback((page: number): number => {
    if (!manifest) return 1;
    const hasPending = pendingTextRef.current.has(page);
    const baseVersion = getPageEditVersion(manifest, page);
    return hasPending ? baseVersion + 1 : baseVersion;
  }, [manifest]);

  // ---- Load from IndexedDB by project path ----
  const loadProject = useCallback(async (folderPath?: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_MANIFEST, "readonly");
      const os = tx.objectStore(STORE_MANIFEST);
      const req = os.get(folderPath ?? "");
      const result = await new Promise<{ projectPath: string } & OcrDiffManifest | null>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
      db.close();

      if (!result) throw new Error("找不到项目");

      const { projectPath: storedPath, ...manifestData } = result;
      setProjectPath(storedPath ?? folderPath ?? null);
      setManifest(manifestData);
      pendingTextRef.current = new Map();
      setPendingText(new Map());

      // Load page images
      const images = new Map<number, string>();
      const pageTx = db.transaction(STORE_PAGES, "readonly");
      const pageOs = pageTx.objectStore(STORE_PAGES);
      const pageReq = pageOs.openCursor();
      await new Promise<void>((resolve, reject) => {
        pageReq.onsuccess = () => {
          const cursor = pageReq.result;
          if (cursor) {
            const { projectPath_page, blob } = cursor.value;
            if (projectPath_page.startsWith(folderPath ?? "") && blob) {
              blobToDataUri(blob).then((dataUri) => {
                const pageNum = parseInt(projectPath_page.split("_page_")[1] ?? "-1", 10);
                if (!isNaN(pageNum) && pageNum >= 0) images.set(pageNum, dataUri);
                cursor.continue();
              });
            } else {
              cursor.continue();
            }
          } else {
            resolve();
          }
        };
        pageReq.onerror = () => reject(pageReq.error);
      });

      setPageImages(images);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ---- Load from zip file ----
  const loadZipFile = useCallback(async (file: File) => {
    setError(null);
    setIsLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      const manifestFile = zip.file("manifest.json");
      if (!manifestFile) throw new Error("无效的 .ocrdiff 文件：缺少 manifest.json");

      const manifestJson = await manifestFile.async("text");
      const loadedManifest: OcrDiffManifest = JSON.parse(manifestJson);

      if (!loadedManifest.base?.pages) {
        throw new Error("无效的 .ocrdiff 文件：缺少 base.pages");
      }

      const safeName = loadedManifest.pdf_name.replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9_\u4e00-\u9fff-]/g, "_");
      const folderName = `${safeName}_import_${Date.now()}`;

      await dbPut(STORE_MANIFEST, { projectPath: folderName, ...loadedManifest }, folderName);

      const images = new Map<number, string>();
      for (const [name, zipEntry] of Object.entries(zip.files)) {
        if (name.startsWith("pages/") && !zipEntry.dir) {
          const imgBlob = await zipEntry.async("blob");
          const pageNum = parseInt(name.replace("pages/page_", "").replace(".png", ""), 10);
          const pageKey = `${folderName}_page_${pageNum}`;
          await dbPut(STORE_PAGES, { projectPath_page: pageKey, blob: imgBlob });
          const dataUri = await blobToDataUri(imgBlob);
          images.set(pageNum, dataUri);
        }
      }

      setProjectPath(folderName);
      setManifest(loadedManifest);
      setPageImages(images);
      pendingTextRef.current = new Map();
      setPendingText(new Map());
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ---- Export to .ocrdiff.zip (browser download) ----
  const exportZip = useCallback(async () => {
    if (!projectPath || !manifest) return;
    setIsSaving(true);
    try {
      const zip = new JSZip();
      zip.file("manifest.json", JSON.stringify(manifest, null, 2));

      for (const basePage of manifest.base.pages) {
        const dataUri = pageImagesRef.current.get(basePage.page) ?? "";
        if (dataUri) {
          const bytes = dataUriToBytes(dataUri);
          zip.file(basePage.image, bytes);
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${manifest.pdf_name.replace(/\.pdf$/i, "")}.ocrdiff.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出失败");
    } finally {
      setIsSaving(false);
    }
  }, [projectPath, manifest]);

  // ---- Close project ----
  const closeProject = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setProjectPath(null);
    setManifest(null);
    setPages(new Map());
    setPageImages(new Map());
    setError(null);
    pendingTextRef.current = new Map();
    setPendingText(new Map());
  }, []);

  return {
    projectPath,
    manifest,
    pages,
    isLoading,
    isSaving,
    error,
    hasProject: projectPath !== null,
    hasManifest: manifest !== null,
    createProject,
    savePageImage,
    addBasePage,
    updatePendingText,
    save,
    saveAll,
    isDirty,
    getVersions,
    restoreVersion,
    getPageText,
    getPageVersion,
    loadProject,
    loadZipFile,
    exportZip,
    closeProject,
  };
}
