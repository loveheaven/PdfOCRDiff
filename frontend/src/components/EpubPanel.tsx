import { useRef } from "react";
import type { EpubChapter } from "../hooks/useEpub";

interface EpubPanelProps {
  chapters: EpubChapter[];
  currentChapter: number;
  isLoading: boolean;
  error: string | null;
  onUpload: (file: File) => void;
  onChapterChange: (index: number) => void;
}

export default function EpubPanel({
  chapters,
  currentChapter,
  isLoading,
  error,
  onUpload,
  onChapterChange,
}: EpubPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-white">
        <h2 className="text-sm font-semibold text-gray-700 mr-auto">EPUB 参考</h2>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "解析中..." : "上传 EPUB"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".epub"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-red-50 border-b border-red-100 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Chapter Selector */}
      {chapters.length > 1 && (
        <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
          <select
            value={currentChapter}
            onChange={(e) => onChapterChange(Number(e.target.value))}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white"
          >
            {chapters.map((ch, i) => (
              <option key={i} value={i}>
                {ch.title || `章节 ${i + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Placeholder info */}
      {chapters.length === 0 && !isLoading && !error && (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          请上传 EPUB 文件
        </div>
      )}
    </div>
  );
}
