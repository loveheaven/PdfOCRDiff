import { useRef, useState } from "react";

interface SettingsBarProps {
  onOpenSettings: () => void;
  onLoadOcrDiff: (file: File) => void;
  onExport?: () => void;
  onToggleCompare?: () => void;
  isCompareActive: boolean;
  ocrDiffLoading: boolean;
  ocrDiffName: string | null;
  isProjectMode: boolean;
}

export default function SettingsBar({
  onOpenSettings,
  onLoadOcrDiff,
  onExport,
  onToggleCompare,
  isCompareActive,
  ocrDiffLoading,
  ocrDiffName,
  isProjectMode,
}: SettingsBarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLoadOcrDiff(file);
    e.target.value = "";
    setMenuOpen(false);
  };

  const handleMenuClick = (action: () => void) => {
    action();
    // setMenuOpen(false);
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
        {/* Menu button */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            disabled={ocrDiffLoading}
            className="px-3 py-1 text-xs bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            ☰ 菜单
          </button>

          {menuOpen && (
            <>
              {/* Backdrop to close menu */}
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />

              {/* Dropdown menu */}
              <div className="absolute right-0 mt-1 w-40 bg-gray-700 border border-gray-600 rounded shadow-lg z-20">
                {onExport && (
                  <button
                    onClick={() => handleMenuClick(onExport)}
                    disabled={ocrDiffLoading}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-600 disabled:opacity-50"
                  >
                    导出
                  </button>
                )}
                <button
                  onClick={() => handleMenuClick(() => fileRef.current?.click())}
                  disabled={ocrDiffLoading}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-600 disabled:opacity-50"
                >
                  {ocrDiffLoading ? "加载中..." : "打开"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".ocrdiff,.ocrdiff.zip,application/zip,application/x-zip-compressed"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {onToggleCompare && (
                  <button
                    onClick={() => handleMenuClick(onToggleCompare)}
                    className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-600 ${
                      isCompareActive ? "bg-gray-600" : ""
                    }`}
                  >
                    对比 {isCompareActive ? "✓" : ""}
                  </button>
                )}
                <div className="border-t border-gray-600" />
                <button
                  onClick={() => handleMenuClick(onOpenSettings)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-600"
                >
                  设置
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}