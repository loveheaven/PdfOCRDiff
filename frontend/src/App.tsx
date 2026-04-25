import { useState, useEffect } from "react";
import SettingsBar from "./components/SettingsBar";
import SettingsDialog from "./components/SettingsDialog";
import PdfPanel from "./components/PdfPanel";
import EditablePanel from "./components/EditablePanel";
import DiffPanel from "./components/DiffPanel";
import EpubPanel from "./components/EpubPanel";
import { useOcrStream } from "./hooks/useOcrStream";
import { useEpub } from "./hooks/useEpub";
import { useDiff } from "./hooks/useDiff";
import { useEditorStore } from "./hooks/useEditorStore";

function App() {
  const ocr = useOcrStream();
  const epub = useEpub();
  const diff = useDiff();
  const editor = useEditorStore();

  const [epubChapter, setEpubChapter] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Initialize editor text when OCR results arrive
  useEffect(() => {
    for (const [pageNum, result] of ocr.pages) {
      editor.initPage(pageNum, result.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocr.pages]);

  // Current editor text (possibly edited by user)
  const currentEditorText = editor.getText(ocr.currentPage);

  // Current EPUB text
  const currentEpubText = epub.chapters[epubChapter]?.text || "";

  // Auto-compute diff when both texts are available
  useEffect(() => {
    if (currentEditorText && currentEpubText) {
      diff.computeDiff(currentEditorText, currentEpubText);
    } else {
      diff.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEditorText, currentEpubText]);

  // Build allPagesText map for EditablePanel
  const allPagesText = new Map<number, string>();
  for (let i = 0; i < ocr.totalPages; i++) {
    allPagesText.set(i, editor.getText(i));
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <SettingsBar onOpenSettings={() => setSettingsOpen(true)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* Three-column layout */}
      <div className="flex flex-1 min-h-0">
        {/* Left: PDF thumbnails */}
        <div className="w-1/4 border-r border-gray-300 flex flex-col min-h-0">
          <PdfPanel
            pages={ocr.pages}
            currentPage={ocr.currentPage}
            totalPages={ocr.totalPages}
            completedCount={ocr.completedCount}
            status={ocr.status}
            error={ocr.error}
            onUpload={(file) => ocr.uploadAndStart(file)}
            onPause={() => ocr.pause()}
            onResume={() => ocr.resume()}
            onPageChange={(page) => ocr.setCurrentPage(page)}
          />
        </div>

        {/* Middle: Editable OCR text */}
        <div className="w-[37.5%] border-r border-gray-300 flex flex-col min-h-0">
          <EditablePanel
            text={currentEditorText}
            onTextChange={(t) => editor.setText(ocr.currentPage, t)}
            onSave={() => editor.save(ocr.currentPage)}
            diffs={diff.diffs}
            isComputing={diff.isComputing}
            dirty={editor.isDirty(ocr.currentPage)}
            currentVersion={editor.getCurrentVersion(ocr.currentPage)}
            versions={editor.getVersions(ocr.currentPage)}
            onRestoreVersion={(v) => editor.restoreVersion(ocr.currentPage, v)}
            allPagesText={allPagesText}
            totalPages={ocr.totalPages}
            currentPage={ocr.currentPage}
            onPageChange={(page) => ocr.setCurrentPage(page)}
          />
        </div>

        {/* Right: EPUB upload + text with diff highlights */}
        <div className="w-[37.5%] flex flex-col min-h-0">
          <EpubPanel
            chapters={epub.chapters}
            currentChapter={epubChapter}
            isLoading={epub.isLoading}
            error={epub.error}
            onUpload={(file) => epub.uploadEpub(file)}
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
      </div>
    </div>
  );
}

export default App;
