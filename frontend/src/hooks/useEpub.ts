import { useState, useCallback } from "react";
import JSZip from "jszip";

export interface EpubChapter {
  title: string;
  text: string;
}

interface UseEpubReturn {
  chapters: EpubChapter[];
  isLoading: boolean;
  error: string | null;
  loadEpub: (file: File) => Promise<void>;
  reset: () => void;
}

/**
 * Parse EPUB entirely in the browser using JSZip + DOMParser.
 * No backend needed.
 */
export function useEpub(): UseEpubReturn {
  const [chapters, setChapters] = useState<EpubChapter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setChapters([]);
    setIsLoading(false);
    setError(null);
  }, []);

  const loadEpub = useCallback(async (file: File) => {
    reset();
    setIsLoading(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      // 1. Read container.xml to find the OPF file path
      const containerXml = await zip.file("META-INF/container.xml")?.async("text");
      if (!containerXml) throw new Error("Invalid EPUB: missing container.xml");

      const containerDoc = new DOMParser().parseFromString(containerXml, "application/xml");
      const rootfilePath = containerDoc.querySelector("rootfile")?.getAttribute("full-path");
      if (!rootfilePath) throw new Error("Invalid EPUB: no rootfile path");

      // 2. Read the OPF file to get the spine order
      const opfText = await zip.file(rootfilePath)?.async("text");
      if (!opfText) throw new Error("Invalid EPUB: missing OPF file");

      const opfDoc = new DOMParser().parseFromString(opfText, "application/xml");
      const opfDir = rootfilePath.includes("/") ? rootfilePath.substring(0, rootfilePath.lastIndexOf("/") + 1) : "";

      // Build id → href map from manifest
      const manifestItems = new Map<string, string>();
      opfDoc.querySelectorAll("manifest > item").forEach((item) => {
        const id = item.getAttribute("id");
        const href = item.getAttribute("href");
        const mediaType = item.getAttribute("media-type") || "";
        if (id && href && mediaType.includes("html")) {
          manifestItems.set(id, opfDir + href);
        }
      });

      // Get spine order
      const spineRefs: string[] = [];
      opfDoc.querySelectorAll("spine > itemref").forEach((ref) => {
        const idref = ref.getAttribute("idref");
        if (idref) spineRefs.push(idref);
      });

      // 3. Parse each spine item in order
      const parsedChapters: EpubChapter[] = [];

      for (const idref of spineRefs) {
        const href = manifestItems.get(idref);
        if (!href) continue;

        const html = await zip.file(href)?.async("text");
        if (!html) continue;

        const doc = new DOMParser().parseFromString(html, "application/xhtml+xml");
        const body = doc.querySelector("body");
        if (!body) continue;

        const text = (body.textContent || "").trim();
        if (!text) continue;

        // Try to extract a title
        let title = "";
        const titleEl = doc.querySelector("h1, h2, h3, title");
        if (titleEl) title = (titleEl.textContent || "").trim();

        parsedChapters.push({
          title: title || href.split("/").pop() || `Chapter ${parsedChapters.length + 1}`,
          text,
        });
      }

      if (parsedChapters.length === 0) {
        throw new Error("EPUB 中未找到有效文本内容");
      }

      setChapters(parsedChapters);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "EPUB 解析失败");
    } finally {
      setIsLoading(false);
    }
  }, [reset]);

  return { chapters, isLoading, error, loadEpub, reset };
}
