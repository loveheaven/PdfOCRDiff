import { useState, useRef, useEffect, useCallback } from "react";
import type { DiffSegment } from "../hooks/useDiff";
import type { TextVersion } from "../hooks/useOcrDiffProject";

interface EditablePanelProps {
  /** Current editable text for this page */
  text: string;
  /** Callback when user edits */
  onTextChange: (text: string) => void;
  /** Manually trigger save */
  onSave: () => void;
  /** Diff segments (if available) */
  diffs: DiffSegment[];
  isComputing: boolean;
  /** Whether text has unsaved changes */
  dirty: boolean;
  /** Current version number */
  currentVersion: number;
  /** Version history */
  versions: TextVersion[];
  /** Restore a version */
  onRestoreVersion: (version: number) => void;
  /** All pages text map (for rendering all pages with separators) */
  allPagesText: Map<number, string>;
  /** Total pages */
  totalPages: number;
  /** Currently selected page */
  currentPage: number;
  /** Callback to navigate to a page */
  onPageChange: (page: number) => void;
}

export default function EditablePanel({
  text,
  onTextChange,
  onSave,
  diffs,
  isComputing,
  dirty,
  currentVersion,
  versions,
  onRestoreVersion,
  allPagesText,
  totalPages,
  currentPage,
  onPageChange,
}: EditablePanelProps) {
  const [showVersions, setShowVersions] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Scroll to the current page section
  useEffect(() => {
    const el = pageRefs.current.get(currentPage);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [currentPage]);

  const setPageRef = useCallback((page: number) => (el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(page, el);
    else pageRefs.current.delete(page);
  }, []);

  // Render diff content for the current page (read-only mode)
  const renderDiffContent = () => {
    if (isComputing) return <span className="text-gray-400 text-sm">正在对比...</span>;

    if (diffs.length === 0) {
      return <span className="whitespace-pre-wrap text-sm leading-relaxed">{text}</span>;
    }

    return diffs.map((seg, i) => {
      switch (seg.type) {
        case "equal":
          return <span key={i} className="text-sm leading-relaxed">{seg.text}</span>;
        case "delete":
          return (
            <span key={i} className="text-sm leading-relaxed bg-red-100 border border-red-400 rounded-sm px-0.5 text-red-800">
              {seg.text}
            </span>
          );
        case "insert":
          return null; // inserts only show on EPUB side
        case "replace":
          return (
            <span key={i} className="text-sm leading-relaxed bg-red-100 border border-red-400 rounded-sm px-0.5 text-red-800">
              {seg.text_a}
            </span>
          );
        default:
          return null;
      }
    });
  };

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i);

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-white shrink-0">
        <h2 className="text-sm font-semibold text-gray-700">OCR 识别结果</h2>
        {dirty && <span className="text-[10px] text-orange-500 ml-1">未保存</span>}
        {currentVersion > 0 && (
          <span className="text-[10px] text-gray-400 ml-1">v{currentVersion}</span>
        )}
        {diffs.length > 0 && (
          <span className="text-xs text-red-600 ml-2">
            {diffs.filter((d) => d.type !== "equal").length} 处差异
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setEditMode(!editMode)}
            className={`px-2 py-1 text-xs rounded border transition-colors ${
              editMode ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 hover:bg-gray-100"
            }`}
          >
            {editMode ? "预览" : "编辑"}
          </button>
          <button
            onClick={onSave}
            disabled={!dirty}
            className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            保存
          </button>
          <button
            onClick={() => setShowVersions(!showVersions)}
            className={`px-2 py-1 text-xs rounded border transition-colors ${
              showVersions ? "bg-gray-200 border-gray-400" : "border-gray-300 hover:bg-gray-100"
            }`}
          >
            历史
          </button>
        </div>
      </div>

      {/* Version history dropdown */}
      {showVersions && (
        <div className="absolute top-12 right-2 z-40 bg-white border border-gray-200 rounded-lg shadow-xl w-64 max-h-60 overflow-auto">
          <div className="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-600">版本历史（第 {currentPage + 1} 页）</div>
          {versions.length === 0 ? (
            <div className="px-3 py-4 text-xs text-gray-400 text-center">暂无历史版本</div>
          ) : (
            versions.map((v) => (
              <div
                key={v.version}
                onClick={() => { onRestoreVersion(v.version); setShowVersions(false); }}
                className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-b-0"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-700">v{v.version}</span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(v.modified_at).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-[10px] text-gray-400 mt-0.5 truncate">
                  {v.text.slice(0, 60)}...
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Content area: all pages with separators */}
      <div className="flex-1 overflow-auto">
        {totalPages === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            等待 OCR 结果...
          </div>
        ) : editMode ? (
          /* Edit mode: single textarea for current page */
          <div className="p-4">
            <div className="text-xs text-gray-400 mb-2">正在编辑第 {currentPage + 1} 页</div>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              className="w-full h-[calc(100vh-220px)] text-sm leading-relaxed border border-gray-300 rounded-md p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              spellCheck={false}
            />
          </div>
        ) : (
          /* Preview mode: all pages with separators */
          <div className="divide-y divide-gray-200">
            {pageNumbers.map((pageNum) => {
              const pageText = allPagesText.get(pageNum) || "";
              const isCurrentPage = pageNum === currentPage;
              return (
                <div
                  key={pageNum}
                  ref={setPageRef(pageNum)}
                  onClick={() => onPageChange(pageNum)}
                  className={`p-4 cursor-pointer transition-colors ${
                    isCurrentPage ? "bg-blue-50/50" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      isCurrentPage ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-500"
                    }`}>
                      第 {pageNum + 1} 页
                    </span>
                  </div>
                  {pageText ? (
                    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {isCurrentPage ? renderDiffContent() : pageText}
                    </div>
                  ) : (
                    <div className="text-gray-300 text-xs italic">尚未识别</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
