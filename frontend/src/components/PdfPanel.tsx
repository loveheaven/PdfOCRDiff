import { useRef, useEffect, useState } from "react";
import type { OcrPageResult, OcrStatus } from "../hooks/useOcrStream";

interface PdfPanelProps {
  pages: Map<number, OcrPageResult>;
  currentPage: number;
  totalPages: number;
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
  status,
  error,
  onUpload,
  onPause,
  onResume,
  onPageChange,
}: PdfPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pageInput, setPageInput] = useState(String(currentPage + 1));

  // Sync input when currentPage changes
  useEffect(() => {
    setPageInput(String(currentPage + 1));
  }, [currentPage]);

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow positive integers
    const val = e.target.value.replace(/\D/g, "");
    setPageInput(val);
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const page = parseInt(pageInput, 10);
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        onPageChange(page - 1);
        // Blur to confirm and hide mobile keyboard
        (e.target as HTMLInputElement).blur();
      } else {
        setPageInput(String(currentPage + 1));
      }
    }
  };

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
    el?.scrollIntoView({ block: "center", behavior: "auto" });
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

      {/* Status + page jump */}
      {totalPages > 0 && (
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 shrink-0 flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {status === "processing" && "识别中..."}
            {status === "paused" && "已暂停"}
            {status === "done" && "已完成"}
            {status === "idle" && "空闲"}
          </span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pageInput}
            onChange={handlePageInputChange}
            onKeyDown={handlePageInputKeyDown}
            className="ml-auto w-14 px-2 py-1 text-center border border-gray-300 rounded text-xs"
          />
          <span className="text-xs text-gray-500">/ {totalPages} 页</span>
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
