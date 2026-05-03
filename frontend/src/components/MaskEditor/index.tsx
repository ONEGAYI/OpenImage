import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMaskCanvas } from "./useMaskCanvas";
import MaskCanvas from "./MaskCanvas";
import ToolBar from "./ToolBar";
import { getImageFileUrl, getSettings } from "../../services/api";
import { fileToAttachment } from "../../utils/file";
import type { MaskImageSource, AttachedFile, SettingsResponse } from "../../types";

const M = {
  bg: "#141413",
  headerBg: "#181715",
  headerBorder: "#252320",
  footerBg: "#1c1b18",
  inputBg: "#252320",
  accentBtnBg: "#cc785c",
  cancelBtnColor: "#cc785c",
  dangerBtnBg: "#c96442",
  errorBg: "#1f1b1b",
  errorBorder: "#3d2020",
  errorColor: "#c64545",
  mutedText: "#a09d96",
  fgText: "#faf9f5",
  refBorder: "#3a3835",
  dashedBorder: "#555",
  placeholder: "#777",
};

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
      img.src = "";
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
          background: M.bg,
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
            background: M.headerBg,
            borderBottom: `1px solid ${M.headerBorder}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: M.fgText, fontSize: 14, fontWeight: 500 }}>{t("mask.title")}</span>
            <span style={{ color: M.mutedText, fontSize: 12 }}>{sourceLabel}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: "6px 16px",
                borderRadius: 6,
                background: M.inputBg,
                color: M.cancelBtnColor,
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
                background: M.inputBg,
                color: M.fgText,
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
              background: M.errorBg,
              borderTop: `1px solid ${M.errorBorder}`,
              color: M.errorColor,
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
          background: M.footerBg,
          borderTop: `1px solid ${M.headerBorder}`,
          minHeight: references.length > 0 ? 40 : 28,
        }}>
          <span style={{ fontSize: 10, color: M.mutedText, flexShrink: 0 }}>{t("mask.referenceImages")}</span>
          {references.map((ref) => (
            <div
              key={ref.id}
              style={{
                width: 32, height: 32, borderRadius: 4,
                border: `1px solid ${M.refBorder}`, position: "relative", flexShrink: 0,
              }}
            >
              <img src={ref.preview_url} alt={ref.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button
                onClick={() => handleRemoveReference(ref.id)}
                style={{
                  position: "absolute", top: -3, right: -3, width: 13, height: 13,
                  background: M.dangerBtnBg, borderRadius: "50%",
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
              width: 32, height: 32, border: `1px dashed ${M.dashedBorder}`, borderRadius: 4,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: M.placeholder, fontSize: 14, cursor: "pointer", flexShrink: 0,
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
            background: M.headerBg,
            borderTop: `1px solid ${M.headerBorder}`,
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
              background: M.inputBg,
              border: "none",
              color: M.fgText,
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
              style={{ fontSize: 12, color: M.mutedText, cursor: "help" }}
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
              background: M.accentBtnBg,
              color: M.fgText,
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
