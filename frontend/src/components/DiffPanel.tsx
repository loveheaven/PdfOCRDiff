import type { DiffSegment } from "../hooks/useDiff";

interface DiffPanelProps {
  ocrText: string;
  diffs: DiffSegment[];
  isComputing: boolean;
  side: "a" | "b"; // "a" = OCR side (middle), "b" = EPUB side (right)
  title: string;
}

export default function DiffPanel({ ocrText, diffs, isComputing, side, title }: DiffPanelProps) {
  const renderDiffContent = () => {
    if (isComputing) {
      return <span className="text-gray-400 text-sm">正在对比...</span>;
    }

    if (diffs.length === 0) {
      // No diff computed yet, show plain text
      return <span className="whitespace-pre-wrap text-sm leading-relaxed">{ocrText}</span>;
    }

    return diffs.map((seg, i) => {
      switch (seg.type) {
        case "equal":
          return <span key={i} className="text-sm leading-relaxed">{seg.text}</span>;

        case "delete":
          // Only show on side A (OCR)
          if (side === "a") {
            return (
              <span
                key={i}
                className="text-sm leading-relaxed bg-red-100 border border-red-400 rounded-sm px-0.5 text-red-800"
              >
                {seg.text}
              </span>
            );
          }
          return null;

        case "insert":
          // Only show on side B (EPUB)
          if (side === "b") {
            return (
              <span
                key={i}
                className="text-sm leading-relaxed bg-red-100 border border-red-400 rounded-sm px-0.5 text-red-800"
              >
                {seg.text}
              </span>
            );
          }
          return null;

        case "replace":
          if (side === "a") {
            return (
              <span
                key={i}
                className="text-sm leading-relaxed bg-red-100 border border-red-400 rounded-sm px-0.5 text-red-800"
              >
                {seg.text_a}
              </span>
            );
          } else {
            return (
              <span
                key={i}
                className="text-sm leading-relaxed bg-red-100 border border-red-400 rounded-sm px-0.5 text-red-800"
              >
                {seg.text_b}
              </span>
            );
          }

        default:
          return null;
      }
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center p-3 border-b border-gray-200 bg-white">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        {diffs.length > 0 && (
          <span className="ml-auto text-xs text-red-600">
            {diffs.filter((d) => d.type !== "equal").length} 处差异
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4 bg-white">
        {ocrText ? (
          <div className="whitespace-pre-wrap break-words">{renderDiffContent()}</div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            {side === "a" ? "等待 OCR 结果..." : "等待 EPUB 内容..."}
          </div>
        )}
      </div>
    </div>
  );
}
