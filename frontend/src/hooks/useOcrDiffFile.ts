import { useState, useCallback } from "react";
import JSZip from "jszip";

export interface OcrDiffPage {
  page: number;
  image: string; // data URI
  text: string;
  boxes: number[][][];
  scores: number[];
}

export interface OcrDiffManifest {
  version: number;
  pdf_name: string;
  total_pages: number;
  dpi: number;
  created_at: string;
  pages: OcrDiffPage[];
}

interface UseOcrDiffFileReturn {
  manifest: OcrDiffManifest | null;
  pages: Map<number, OcrDiffPage>;
  isLoading: boolean;
  error: string | null;
  loadFile: (file: File) => Promise<void>;
  reset: () => void;
}

/**
 * Load and parse a .ocrdiff file (ZIP archive) in the browser.
 */
export function useOcrDiffFile(): UseOcrDiffFileReturn {
  const [manifest, setManifest] = useState<OcrDiffManifest | null>(null);
  const [pages, setPages] = useState<Map<number, OcrDiffPage>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setManifest(null);
    setPages(new Map());
    setIsLoading(false);
    setError(null);
  }, []);

  const loadFile = useCallback(async (file: File) => {
    reset();
    setIsLoading(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      // Read manifest
      const manifestFile = zip.file("manifest.json");
      if (!manifestFile) {
        throw new Error("无效的 .ocrdiff 文件：缺少 manifest.json");
      }

      const manifestJson = await manifestFile.async("text");
      const parsed: OcrDiffManifest = JSON.parse(manifestJson);

      if (!parsed.pages || !Array.isArray(parsed.pages)) {
        throw new Error("无效的 manifest：缺少 pages 数组");
      }

      // Load page images
      const pageMap = new Map<number, OcrDiffPage>();

      for (const pageInfo of parsed.pages) {
        const imgFile = zip.file(pageInfo.image);
        if (imgFile) {
          const imgBlob = await imgFile.async("blob");
          const dataUri = await blobToDataUri(imgBlob);
          pageMap.set(pageInfo.page, {
            ...pageInfo,
            image: dataUri,
          });
        } else {
          // Image missing, keep text only
          pageMap.set(pageInfo.page, {
            ...pageInfo,
            image: "",
          });
        }
      }

      setManifest(parsed);
      setPages(pageMap);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setIsLoading(false);
    }
  }, [reset]);

  return { manifest, pages, isLoading, error, loadFile, reset };
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
