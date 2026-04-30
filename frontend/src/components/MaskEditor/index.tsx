import { useState, useRef, useCallback, useEffect } from "react";
import { useMaskCanvas } from "./useMaskCanvas";
import MaskCanvas from "./MaskCanvas";
import ToolBar from "./ToolBar";
import { getImageFileUrl } from "../../services/api";
import type { MaskImageSource } from "../../types";

interface MaskEditorProps {
  source: MaskImageSource;
  onClose: () => void;
  onGenerate: (maskB64: string, prompt: string, reportError: (msg: string) => void) => void;
}

export default function MaskEditor({ source, onClose, onGenerate }: MaskEditorProps) {
  const [prompt, setPrompt] = useState("");
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const imageUrl =
    source.type === "generated"
      ? getImageFileUrl(source.imageId)
      : `data:image/png;base64,${source.imageB64}`;

  const onGenerateRef = useRef(onGenerate);
  onGenerateRef.current = onGenerate;

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setImageEl(img); };
    img.src = imageUrl;
    return () => {
      cancelled = true;
      img.src = "";  // 中止未完成的图片请求
    };
  }, [imageUrl]);

  const hook = useMaskCanvas(canvasRef, imageEl);

  const handleGenerate = useCallback(() => {
    const maskB64 = hook.exportMask();
    if (!maskB64 || !prompt.trim()) return;
    setGenerating(true);
    setErrorMsg(null);
    onGenerateRef.current(maskB64, prompt.trim(), (msg: string) => {
      setGenerating(false);
      setErrorMsg(msg);
    });
  }, [hook.exportMask, prompt]);

  const sourceLabel =
    source.type === "generated"
      ? source.imageId
      : "来自附件";

  const canSubmit = hook.state.hasMask && prompt.trim() && !generating;

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
                color: "#cc785c",
                border: "none",
                fontSize: 13,
                fontWeight: 600,
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

        {/* 错误提示 */}
        {errorMsg && (
          <div
            style={{
              padding: "8px 20px",
              background: "#1f1b1b",
              borderTop: "1px solid #3d2020",
              color: "#c64545",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {errorMsg}
          </div>
        )}

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
            onChange={(e) => { setPrompt(e.target.value); if (errorMsg) setErrorMsg(null); }}
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
              if (e.key === "Enter" && canSubmit) {
                handleGenerate();
              }
            }}
          />
          <button
            onClick={handleGenerate}
            disabled={!canSubmit}
            style={{
              padding: "9px 22px",
              borderRadius: 8,
              background: "#cc785c",
              color: "#faf9f5",
              border: "none",
              fontSize: 13,
              fontWeight: 500,
              cursor: canSubmit ? "pointer" : "default",
              opacity: canSubmit ? 1 : 0.4,
            }}
          >
            {generating ? "Generating..." : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
