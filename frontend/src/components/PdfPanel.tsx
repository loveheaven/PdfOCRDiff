import { useRef, useEffect } from "react";
import type { OcrPageResult, OcrStatus } from "../hooks/useOcrStream";

interface PdfPanelProps {
  pages: Map<number, OcrPageResult>;
  currentPage: number;
  totalPages: number;
  completedCount: number;
  status: OcrStatus;
  error: string | null;
  onUpload: (file: File) => void;
  onPause: () => void;
  onResume: () => void;
  onPageChange: (page: number) => void;
}

export default function PdfPanel({
  pages,
  currentPage,
  totalPages,
  completedCount,
  status,
  error,
  onUpload,
  onPause,
  onResume,
  onPageChange,
}: PdfPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    e.target.value = "";
  };

  const handleActionClick = () => {
    if (status === "processing") {
      onPause();
    } else if (status === "paused") {
      onResume();
    } else {
      fileInputRef.current?.click();
    }
  };

  // Scroll selected thumbnail into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-page="${currentPage}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentPage]);

  let buttonLabel: string;
  let buttonClass: string;
  switch (status) {
    case "processing":
      buttonLabel = "暂停";
      buttonClass = "bg-yellow-500 hover:bg-yellow-600";
      break;
    case "paused":
      buttonLabel = "继续";
      buttonClass = "bg-green-600 hover:bg-green-700";
      break;
    case "done":
      buttonLabel = "重新上传";
      buttonClass = "bg-blue-600 hover:bg-blue-700";
      break;
    default:
      buttonLabel = "上传 PDF";
      buttonClass = "bg-blue-600 hover:bg-blue-700";
  }

  // Build ordered page list
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-white shrink-0">
        <h2 className="text-sm font-semibold text-gray-700">PDF / OCR</h2>
        {totalPages > 0 && (
          <span className="text-xs text-gray-500 ml-1">{completedCount}/{totalPages}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleActionClick}
            className={`px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors ${buttonClass}`}
          >
            {buttonLabel}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Progress bar */}
      {totalPages > 0 && status !== "idle" && (
        <div className="px-3 py-2 bg-blue-50 border-b border-blue-100 shrink-0">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className={status === "paused" ? "text-yellow-700" : status === "done" ? "text-green-700" : "text-blue-700"}>
              {status === "processing" && "正在识别..."}
              {status === "paused" && "已暂停"}
              {status === "done" && "识别完成"}
            </span>
            <span className="text-gray-600">{completedCount} / {totalPages} 页</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                status === "done" ? "bg-green-500" : status === "paused" ? "bg-yellow-500" : "bg-blue-600"
              }`}
              style={{ width: `${(completedCount / totalPages) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700 shrink-0">
          {error}
        </div>
      )}

      {/* Page image list – full-size, one per row */}
      <div ref={listRef} className="flex-1 overflow-auto bg-gray-100">
        {pageNumbers.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            请上传 PDF 文件
          </div>
        ) : (
          <div>
            {pageNumbers.map((pageNum) => {
              const result = pages.get(pageNum);
              const isSelected = pageNum === currentPage;
              return (
                <div
                  key={pageNum}
                  data-page={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className="cursor-pointer"
                >
                  {/* Page separator / label */}
                  <div className={`flex items-center gap-2 px-3 py-1.5 text-xs ${
                    isSelected ? "bg-blue-100 text-blue-700 font-semibold" : "bg-gray-200 text-gray-500"
                  }`}>
                    <span>第 {pageNum + 1} 页</span>
                    {isSelected && <span className="ml-auto text-[10px]">● 当前</span>}
                  </div>
                  {/* Page image */}
                  <div className={`border-l-4 ${isSelected ? "border-blue-500" : "border-transparent"}`}>
                    {result ? (
                      <img
                        src={result.image}
                        alt={`Page ${pageNum + 1}`}
                        className="w-full h-auto"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-48 bg-gray-200 text-gray-400 text-xs">
                        尚未识别
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
