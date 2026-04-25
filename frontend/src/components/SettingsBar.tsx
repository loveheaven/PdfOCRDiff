interface SettingsBarProps {
  onOpenSettings: () => void;
}

export default function SettingsBar({ onOpenSettings }: SettingsBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-800 text-white shrink-0">
      <span className="text-sm font-semibold tracking-wide">PdfOCRDiff</span>
      <button
        onClick={onOpenSettings}
        className="ml-auto px-3 py-1 text-xs bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 transition-colors"
      >
        ⚙ 设置
      </button>
    </div>
  );
}
