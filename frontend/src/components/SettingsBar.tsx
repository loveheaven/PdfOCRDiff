import { useRef } from "react";

interface SettingsBarProps {
  onOpenSettings: () => void;
  onLoadOcrDiff: (file: File) => void;
  onExport?: () => void;
  ocrDiffLoading: boolean;
  ocrDiffName: string | null;
  isProjectMode: boolean;
}

export default function SettingsBar({
  onOpenSettings,
  onLoadOcrDiff,
  onExport,
  ocrDiffLoading,
  ocrDiffName,
  isProjectMode,
}: SettingsBarProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLoadOcrDiff(file);
    e.target.value = "";
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 text-white shrink-0">
      <span className="text-sm font-semibold tracking-wide">PdfOCRDiff</span>

      {ocrDiffName && (
        <span className="text-xs text-green-400 ml-2">
          {isProjectMode ? "📁 " : ""}{ocrDiffName}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {onExport && (
          <button
            onClick={onExport}
            disabled={ocrDiffLoading}
            className="px-3 py-1 text-xs bg-emerald-600 border border-emerald-500 rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            title="导出为 .ocrdiff.zip"
          >
            导出识别结果
          </button>
        )}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={ocrDiffLoading}
          className="px-3 py-1 text-xs bg-indigo-600 border border-indigo-500 rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {ocrDiffLoading ? "加载中..." : "打开 .ocrdiff"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".ocrdiff,.ocrdiff.zip,application/zip,application/x-zip-compressed"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={onOpenSettings}
          className="px-3 py-1 text-xs bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 transition-colors"
        >
          ⚙ 设置
        </button>
      </div>
    </div>
  );
}
