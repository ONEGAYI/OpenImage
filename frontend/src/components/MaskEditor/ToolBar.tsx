import type { Tool } from "./useMaskCanvas";

interface ToolBarProps {
  tool: Tool;
  brushSize: number;
  zoom: number;
  onToolChange: (tool: Tool) => void;
  onBrushSizeChange: (size: number) => void;
  onResetZoom: () => void;
}

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "brush", label: "Brush", icon: "M12 19l7-7 3 3-7 7-3-3z M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" },
  { id: "rectangle", label: "Rectangle", icon: "M3 3h18v18H3z" },
  { id: "eraser", label: "Eraser", icon: "M20 20H7L3 16l9-9 8 8-4 4z" },
];

export default function ToolBar({
  tool,
  brushSize,
  zoom,
  onToolChange,
  onBrushSizeChange,
  onResetZoom,
}: ToolBarProps) {
  return (
    <div
      style={{
        width: 52,
        background: "#181715",
        borderRight: "1px solid #252320",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "12px 0",
        gap: 4,
      }}
    >
      {TOOLS.map(({ id, label, icon }) => (
        <button
          key={id}
          onClick={() => onToolChange(id)}
          title={label}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: tool === id ? "#252320" : "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => {
            if (tool !== id) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
          }}
          onMouseLeave={(e) => {
            if (tool !== id) e.currentTarget.style.background = "transparent";
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={tool === id ? "#faf9f5" : "#a09d96"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={icon} />
          </svg>
        </button>
      ))}

      <div style={{ flex: 1 }} />

      {/* 笔刷大小（仅笔刷和橡皮擦时显示） */}
      {tool !== "rectangle" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: Math.min(24, brushSize * 0.6 + 4),
              height: Math.min(24, brushSize * 0.6 + 4),
              borderRadius: "50%",
              border: "2px solid #faf9f5",
            }}
          />
          <span style={{ color: "#faf9f5", fontSize: 10 }}>{brushSize}px</span>
          <input
            type="range"
            min={4}
            max={128}
            value={brushSize}
            onChange={(e) => onBrushSizeChange(Number(e.target.value))}
            style={{ width: 36, writingMode: "vertical-lr", direction: "rtl", accentColor: "#cc785c" }}
          />
        </div>
      )}

      {/* 缩放控制 */}
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <span style={{ color: "#a09d96", fontSize: 10 }}>{Math.round(zoom * 100)}%</span>
        <button
          onClick={onResetZoom}
          style={{
            fontSize: 10,
            color: "#a09d96",
            background: "none",
            border: "1px solid #252320",
            borderRadius: 4,
            padding: "2px 6px",
            cursor: "pointer",
          }}
        >
          Fit
        </button>
      </div>
    </div>
  );
}
