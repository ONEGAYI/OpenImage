import { useState, useRef, useCallback, useEffect } from "react";
import { useMaskCanvas } from "./useMaskCanvas";
import MaskCanvas from "./MaskCanvas";
import ToolBar from "./ToolBar";
import { getImageFileUrl } from "../../services/api";
import type { MaskImageSource } from "../../types";

interface MaskEditorProps {
  source: MaskImageSource;
  onClose: () => void;
  onGenerate: (maskB64: string, prompt: string) => void;
  isGenerating?: boolean;
}

export default function MaskEditor({ source, onClose, onGenerate, isGenerating }: MaskEditorProps) {
  const [prompt, setPrompt] = useState("");
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const imageUrl =
    source.type === "generated"
      ? getImageFileUrl(source.imageId)
      : `data:image/png;base64,${source.imageB64}`;

  // 加载图片元素
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setImageEl(img);
    img.src = imageUrl;
  }, [imageUrl]);

  const hook = useMaskCanvas(canvasRef, imageEl);

  const handleGenerate = useCallback(() => {
    const maskB64 = hook.exportMask();
    if (!maskB64 || !prompt.trim()) return;
    onGenerate(maskB64, prompt.trim());
  }, [hook, prompt, onGenerate]);

  const sourceLabel =
    source.type === "generated"
      ? source.imageId
      : "来自附件";

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 9999, background: "rgba(20,20,19,0.85)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="flex flex-col"
        style={{
          width: "92vw",
          height: "90vh",
          background: "#141413",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
        }}
      >
        {/* 顶栏 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 20px",
            background: "#181715",
            borderBottom: "1px solid #252320",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "#faf9f5", fontSize: 14, fontWeight: 500 }}>Inpaint Editor</span>
            <span style={{ color: "#a09d96", fontSize: 12 }}>{sourceLabel}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                background: "#252320",
                color: "#a09d96",
                border: "none",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={hook.clearMask}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                background: "#252320",
                color: "#faf9f5",
                border: "none",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Clear
            </button>
          </div>
        </div>

        {/* 主区域 */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <ToolBar
            tool={hook.state.tool}
            brushSize={hook.state.brushSize}
            zoom={hook.state.zoom}
            onToolChange={hook.setTool}
            onBrushSizeChange={hook.setBrushSize}
            onResetZoom={hook.resetZoom}
          />
          <MaskCanvas
            maskCanvasHook={hook}
            canvasRef={canvasRef}
          />
        </div>

        {/* 底栏 Prompt */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 20px",
            background: "#181715",
            borderTop: "1px solid #252320",
          }}
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what to generate in the masked area..."
            style={{
              flex: 1,
              padding: "9px 14px",
              borderRadius: 8,
              background: "#252320",
              border: "none",
              color: "#faf9f5",
              fontSize: 13,
              outline: "none",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hook.state.hasMask && prompt.trim()) {
                handleGenerate();
              }
            }}
          />
          <button
            onClick={handleGenerate}
            disabled={!hook.state.hasMask || !prompt.trim() || isGenerating}
            style={{
              padding: "9px 22px",
              borderRadius: 8,
              background: "#cc785c",
              color: "#faf9f5",
              border: "none",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              opacity: !hook.state.hasMask || !prompt.trim() ? 0.4 : 1,
            }}
          >
            {isGenerating ? "Generating..." : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
