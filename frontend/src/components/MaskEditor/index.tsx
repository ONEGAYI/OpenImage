import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMaskCanvas } from "./useMaskCanvas";
import MaskCanvas from "./MaskCanvas";
import ToolBar from "./ToolBar";
import { getImageFileUrl, getSettings } from "../../services/api";
import { fileToAttachment } from "../../utils/file";
import type { MaskImageSource, AttachedFile, SettingsResponse } from "../../types";

interface MaskEditorProps {
  source: MaskImageSource;
  onClose: () => void;
  onGenerate: (
    maskB64: string,
    prompt: string,
    referenceImages: AttachedFile[],
    reportError: (msg: string) => void
  ) => void;
  initialReferences?: AttachedFile[];
}

export default function MaskEditor({ source, onClose, onGenerate, initialReferences }: MaskEditorProps) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState("");
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [references, setReferences] = useState<AttachedFile[]>(initialReferences ?? []);
  const [apiMode, setApiMode] = useState<SettingsResponse["api_mode"]>("responses");
  const referenceFileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const imageUrl =
    source.type === "generated"
      ? getImageFileUrl(source.imageId)
      : `data:image/png;base64,${source.imageB64}`;

  const onGenerateRef = useRef(onGenerate);
  onGenerateRef.current = onGenerate;

  useEffect(() => {
    getSettings().then((s) => setApiMode(s.api_mode)).catch(() => {});
  }, []);

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

  const handleAddReference = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const newRefs = await Promise.all(imageFiles.map(fileToAttachment));
    setReferences((prev) => [...prev, ...newRefs]);
    e.target.value = "";
  }, []);

  const handleRemoveReference = useCallback((id: string) => {
    setReferences((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleGenerate = useCallback(() => {
    const maskB64 = hook.exportMask();
    if (!maskB64 || !prompt.trim()) return;
    setGenerating(true);
    setErrorMsg(null);
    onGenerateRef.current(maskB64, prompt.trim(), references, (msg: string) => {
      setGenerating(false);
      setErrorMsg(msg);
    });
  }, [hook.exportMask, prompt, references]);

  const sourceLabel =
    source.type === "generated"
      ? source.imageId
      : t("mask.sourceAttachment");

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
            <span style={{ color: "#faf9f5", fontSize: 14, fontWeight: 500 }}>{t("mask.title")}</span>
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
              {t("common.cancel")}
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
              {t("mask.clear")}
            </button>
          </div>
        </div>

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

        <div style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: "6px 20px",
          background: "#1c1b18",
          borderTop: "1px solid #252320",
          minHeight: references.length > 0 ? 40 : 28,
        }}>
          <span style={{ fontSize: 10, color: "#a09d96", flexShrink: 0 }}>{t("mask.referenceImages")}</span>
          {references.map((ref) => (
            <div
              key={ref.id}
              style={{
                width: 32, height: 32, borderRadius: 4,
                border: "1px solid #3a3835", position: "relative", flexShrink: 0,
              }}
            >
              <img src={ref.preview_url} alt={ref.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button
                onClick={() => handleRemoveReference(ref.id)}
                style={{
                  position: "absolute", top: -3, right: -3, width: 13, height: 13,
                  background: "#c96442", borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 7, color: "white", border: "none", cursor: "pointer",
                  lineHeight: 1,
                }}
              >✕</button>
            </div>
          ))}
          <button
            onClick={() => referenceFileRef.current?.click()}
            style={{
              width: 32, height: 32, border: "1px dashed #555", borderRadius: 4,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#777", fontSize: 14, cursor: "pointer", flexShrink: 0,
              background: "transparent",
            }}
          >+</button>
          <input
            ref={referenceFileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleAddReference}
            style={{ display: "none" }}
          />
        </div>

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
            placeholder={t("mask.placeholder")}
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
          {apiMode === "images" && references.length > 0 && (
            <span
              style={{ fontSize: 12, color: "#a09d96", cursor: "help" }}
              title={t("mask.imagesModeWarning")}
            >
              ⚠️
            </span>
          )}
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
            {generating ? t("common.generating") : t("input.generate")}
          </button>
        </div>
      </div>
    </div>
  );
}
