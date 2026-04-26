import { useState, useEffect, useMemo, useRef } from "react";
import SettingsBar from "./components/SettingsBar";
import SettingsDialog from "./components/SettingsDialog";
import PdfPanel from "./components/PdfPanel";
import EditablePanel from "./components/EditablePanel";
import DiffPanel from "./components/DiffPanel";
import EpubPanel from "./components/EpubPanel";
import { useOcrStream, type OcrPageResult } from "./hooks/useOcrStream";
import { useOcrDiffProject } from "./hooks/useOcrDiffProject";
import { useEditorStore } from "./hooks/useEditorStore";
import { useEpub } from "./hooks/useEpub";
import { useDiff } from "./hooks/useDiff";

function App() {
  const ocrProject = useOcrDiffProject();
  const epub = useEpub();
  const diff = useDiff();
  const editor = useEditorStore();

  const [currentPage, setCurrentPage] = useState(0);
  const [epubChapter, setEpubChapter] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showComparePanel, setShowComparePanel] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(25); // percent
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  // Drag to resize left panel
  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPanelWidth(Math.min(55, Math.max(15, newWidth)));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Determine data source
  const useProjectSource = ocrProject.hasProject;

  // Wire up useOcrStream with page result callback to save images and add base pages
  const ocr = useOcrStream({
    onPageResult: async (result: OcrPageResult) => {
      if (!ocrProject.hasProject) return;
      await ocrProject.savePageImage(result.page, result.image);
      ocrProject.addBasePage({
        page: result.page,
        image: `pages/page_${String(result.page).padStart(4, "0")}.png`,
        text: result.text,
        markdown_texts: result.markdown_texts,
        page_continuation_flags: result.page_continuation_flags,
        boxes: result.boxes,
        scores: result.scores,
      });
    },
  });

  // When OCR stream completes, flush pending edits and persist manifest
  useEffect(() => {
    if (ocr.status === "done" && ocrProject.hasProject) {
      ocrProject.saveAll();
    }
  }, [ocr.status, ocrProject.hasProject]);

  // Sync currentPage with ocr stream when not in project mode
  useEffect(() => {
    if (!useProjectSource) setCurrentPage(ocr.currentPage);
  }, [ocr.currentPage, useProjectSource]);

  // Current editor text
  const currentEditorText = useMemo(() => {
    if (useProjectSource) return ocrProject.getPageText(currentPage);
    return editor.getText(currentPage);
  }, [useProjectSource, currentPage, ocrProject, editor]);

  // Current EPUB text
  const currentEpubText = epub.chapters[epubChapter]?.text || "";

  // Auto-compute diff
  useEffect(() => {
    if (currentEditorText && currentEpubText) {
      diff.computeDiff(currentEditorText, currentEpubText);
    } else {
      diff.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEditorText, currentEpubText]);

  // Build allPagesText map
  const allPagesText = new Map<number, string>();
  const totalPages = useProjectSource ? (ocrProject.manifest?.total_pages ?? 0) : ocr.totalPages;
  for (let i = 0; i < totalPages; i++) {
    if (useProjectSource) {
      allPagesText.set(i, ocrProject.getPageText(i));
    } else {
      allPagesText.set(i, editor.getText(i));
    }
  }

  // When user edits text
  const handleTextChange = (text: string) => {
    if (useProjectSource) {
      ocrProject.updatePendingText(currentPage, text);
    } else {
      editor.setText(currentPage, text);
    }
  };

  // When user saves manually
  const handleSave = () => {
    if (useProjectSource) {
      ocrProject.save(currentPage);
      ocrProject.saveAll();
    } else {
      editor.save(currentPage);
    }
  };

  // When user restores a version
  const handleRestoreVersion = (version: number) => {
    if (useProjectSource) {
      ocrProject.restoreVersion(currentPage, version);
    } else {
      editor.restoreVersion(currentPage, version);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    if (!useProjectSource) ocr.setCurrentPage(page);
  };

  // Load .ocrdiff zip file
  const handleLoadOcrDiff = async (file: File) => {
    await ocrProject.loadZipFile(file);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <SettingsBar
        onOpenSettings={() => setSettingsOpen(true)}
        onLoadOcrDiff={handleLoadOcrDiff}
        onExport={ocrProject.hasManifest ? ocrProject.exportZip : undefined}
        onToggleCompare={() => setShowComparePanel((v) => !v)}
        isCompareActive={showComparePanel}
        ocrDiffLoading={ocrProject.isLoading || ocrProject.isSaving}
        ocrDiffName={ocrProject.manifest?.pdf_name ?? null}
        isProjectMode={ocrProject.hasProject}
      />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Three-column layout */}
      <div ref={containerRef} className="flex flex-1 min-h-0">
        {/* Left: PDF page images */}
        <div
          style={{ width: `${leftPanelWidth}%` }}
          className="flex flex-col min-h-0"
        >
          <PdfPanel
            pages={useProjectSource ? ocrProject.pages : ocr.pages}
            currentPage={currentPage}
            totalPages={totalPages}
            status={useProjectSource ? "done" : ocr.status}
            error={useProjectSource ? ocrProject.error : ocr.error}
            onUpload={handleUpload}
            onPause={ocr.pause}
            onResume={ocr.resume}
            onPageChange={handlePageChange}
          />
        </div>

        {/* Draggable divider */}
        <div
          onMouseDown={handleDividerMouseDown}
          className="w-1 cursor-col-resize bg-gray-300 hover:bg-blue-400 active:bg-blue-500 shrink-0 transition-colors"
          title="拖动调整宽度"
        />

        {/* Middle: Editable OCR text */}
        <div className="flex-1 border-r border-gray-300 flex flex-col min-h-0">
          <EditablePanel
            text={currentEditorText}
            onTextChange={handleTextChange}
            onSave={handleSave}
            diffs={diff.diffs}
            isComputing={diff.isComputing}
            dirty={useProjectSource ? ocrProject.isDirty(currentPage) : editor.isDirty(currentPage)}
            currentVersion={useProjectSource ? ocrProject.getPageVersion(currentPage) : editor.getCurrentVersion(currentPage)}
            versions={useProjectSource ? ocrProject.getVersions(currentPage) : editor.getVersions(currentPage)}
            onRestoreVersion={handleRestoreVersion}
            allPagesText={allPagesText}
            totalPages={totalPages}
            currentPage={currentPage}
            onPageChange={handlePageChange}
          />
        </div>

        {/* Right: EPUB upload + text with diff highlights */}
        {showComparePanel && (
          <div className="w-[37.5%] flex flex-col min-h-0">
            <EpubPanel
              chapters={epub.chapters}
              currentChapter={epubChapter}
              isLoading={epub.isLoading}
              error={epub.error}
              onUpload={(file) => epub.loadEpub(file)}
              onChapterChange={setEpubChapter}
            />
            <div className="flex-1 min-h-0">
              <DiffPanel
                ocrText={currentEpubText}
                diffs={diff.diffs}
                isComputing={diff.isComputing}
                side="b"
                title="EPUB 参考文字"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Upload handler — creates project BEFORE starting stream
  async function handleUpload(file: File) {
    ocrProject.closeProject();
    ocr.reset();

    const backendUrl = (await import("./config")).getBackendUrl();
    const formData = new FormData();
    formData.append("file", file);

    try {
      const uploadRes = await fetch(`${backendUrl}/ocr/upload`, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.statusText}`);
      const { task_id, total_pages } = await uploadRes.json();

      await ocrProject.createProject(file.name, total_pages);
      ocr.startStream(task_id, total_pages);
    } catch (err) {
      console.error("Upload failed:", err);
    }
  }
}

export default App;
