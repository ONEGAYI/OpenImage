import { useState } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { useGenerationStore } from "../stores/generationStore";
import { getImageFileUrl, deleteImages } from "../services/api";
import MaskEditor from "./MaskEditor";
import type { Image, MaskImageSource } from "../types";

export default function DetailPanel() {
  const { images, selectedImageIds, activeSessionId, selectSession, fetchSessions, clearSelection } = useSessionStore();
  const { setPendingForkFrom } = useGenerationStore();
  const [deleting, setDeleting] = useState(false);
  const [viewingImage, setViewingImage] = useState<Image | null>(null);
  const [buttonPage, setButtonPage] = useState(0);
  const [editingMask, setEditingMask] = useState<MaskImageSource | null>(null);

  const selectedImages = images.filter((img) => selectedImageIds.includes(img.id));
  const isSingle = selectedImages.length === 1;

  const handleRemove = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteImages(selectedImageIds);
      clearSelection();
      if (activeSessionId) {
        await Promise.all([fetchSessions(), selectSession(activeSessionId)]);
      }
    } catch (err) {
      console.error("Failed to delete images:", err);
    } finally {
      setDeleting(false);
    }
  };

  const singleImage: Image | undefined = isSingle ? selectedImages[0] : undefined;

  const handleSave = () => {
    if (!singleImage) return;
    const url = getImageFileUrl(singleImage.id);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openimage_step${singleImage.step}.png`;
    a.click();
  };

  const handleSaveAll = () => {
    selectedImages.forEach((img, i) => {
      setTimeout(() => {
        const url = getImageFileUrl(img.id);
        const a = document.createElement("a");
        a.href = url;
        a.download = `openimage_step${img.step}.png`;
        a.click();
      }, i * 200);
    });
  };

  const handleCopyPrompt = () => {
    if (!singleImage) return;
    navigator.clipboard.writeText(singleImage.prompt);
  };

  const handleCopyPrompts = () => {
    const text = selectedImages.map((img) => `[Step ${img.step}] ${img.prompt}`).join("\n\n");
    navigator.clipboard.writeText(text);
  };

  const handleFork = () => {
    if (!singleImage) return;
    setPendingForkFrom(singleImage.id);
  };

  const handleForkLast = () => {
    const last = selectedImages[selectedImages.length - 1];
    if (last) setPendingForkFrom(last.id);
  };

  if (selectedImages.length === 0) {
    return (
      <div className="flex items-center justify-center border-l" style={{ width: "var(--detail-w)", minWidth: "var(--detail-w)", background: "var(--surface)", borderColor: "var(--border)", color: "var(--faint)", fontSize: 13 }}>
        Select an image
      </div>
    );
  }

  const labelStyle: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--faint)", marginBottom: 4 };

  return (
    <div className="flex flex-col h-full overflow-y-auto border-l" style={{ width: "var(--detail-w)", minWidth: "var(--detail-w)", maxWidth: "var(--detail-w)", background: "var(--surface)", borderColor: "var(--border)", boxSizing: "border-box", transition: "background 0.3s, border-color 0.3s" }}>

      {/* Preview */}
      <div className="border-b overflow-hidden" style={{ padding: 16, borderColor: "var(--border-s)" }}>
        {isSingle ? (
          <img src={getImageFileUrl(singleImage!.id)} alt={`Step ${singleImage!.step}`} className="w-full" style={{ borderRadius: "var(--radius-md)", background: "var(--sand)", display: "block" }} />
        ) : (
          <MultiPreview images={selectedImages} />
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-3.5 flex-1">
        {isSingle ? (
          <>
            <div><div style={labelStyle}>Step</div><div className="text-[13px]" style={{ color: "var(--fg)" }}>{singleImage!.step}</div></div>
            <div><div style={labelStyle}>Prompt</div><div className="text-[13px] leading-[1.6]" style={{ color: "var(--muted)" }}>{singleImage!.prompt}</div></div>
            {singleImage!.revised_prompt && <div><div style={labelStyle}>Revised Prompt</div><div className="text-[13px] leading-[1.6] italic" style={{ color: "var(--muted)" }}>{singleImage!.revised_prompt}</div></div>}
            <div className="flex gap-4">
              {[{ label: "Size", value: singleImage!.size }, { label: "Quality", value: singleImage!.quality }, { label: "Format", value: singleImage!.output_format }].map(({ label, value }) => (
                <div key={label} className="flex-1"><div style={labelStyle}>{label}</div><div className="text-[13px]" style={{ color: "var(--fg)" }}>{value}</div></div>
              ))}
            </div>
            <div><div style={labelStyle}>Created</div><div className="text-[13px]" style={{ color: "var(--fg)" }}>{new Date(singleImage!.created_at).toLocaleString()}</div></div>
          </>
        ) : (
          <>
            <div>
              <div style={labelStyle}>Selection</div>
              <div className="text-[13px] font-medium" style={{ color: "var(--fg)" }}>{selectedImages.length} images selected</div>
            </div>
            <div className="flex gap-4">
              <div className="flex-1"><div style={labelStyle}>Steps</div><div className="text-[13px]" style={{ color: "var(--fg)" }}>{selectedImages.map((img) => img.step).join(", ")}</div></div>
              <div className="flex-1"><div style={labelStyle}>Format</div><div className="text-[13px]" style={{ color: "var(--fg)" }}>{getCommonValue(selectedImages, "output_format")}</div></div>
            </div>
            <div><div style={labelStyle}>Prompts</div>
              <div className="text-[13px] leading-[1.6]" style={{ color: "var(--muted)", maxHeight: 120, overflowY: "auto" }}>
                {selectedImages.map((img) => (
                  <div key={img.id} className="mb-1"><span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--faint)" }}>Step {img.step}:</span> {img.prompt}</div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Actions — 翻页式 */}
      <div
        className="border-t flex flex-col gap-2 mt-auto"
        style={{ padding: 16, borderColor: "var(--border-s)", boxSizing: "border-box" }}
        onWheel={(e) => {
          e.deltaY > 0 ? setButtonPage((p) => Math.min(1, p + 1)) : setButtonPage((p) => Math.max(0, p - 1));
        }}
      >
        <div style={{ overflow: "hidden", position: "relative" }}>
          <div
            style={{
              display: "flex",
              transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
              transform: `translateX(-${buttonPage * 100}%)`,
            }}
          >
            {/* 第一页 */}
            <div style={{ minWidth: "100%", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {isSingle ? (
                <>
                  <button onClick={() => setViewingImage(singleImage!)} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border-none"
                    style={{ background: "var(--accent)", color: "#faf9f5" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-h)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
                  >View</button>
                  <button onClick={handleSave} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border"
                    style={{ background: "var(--sand)", color: "var(--fg)", borderColor: "var(--border)", boxSizing: "border-box" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.boxShadow = "0 1px 4px var(--card-shadow)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--sand)"; e.currentTarget.style.boxShadow = "none"; }}
                  >Save Image</button>
                  <button onClick={handleRemove} disabled={deleting} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border-none disabled:opacity-50"
                    style={{ background: "rgba(181,51,51,0.08)", color: "var(--error)", boxSizing: "border-box" }}
                    onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "rgba(181,51,51,0.14)"; }}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(181,51,51,0.08)")}
                  >{deleting ? "Removing..." : "Remove"}</button>
                </>
              ) : (
                <>
                  <button onClick={handleRemove} disabled={deleting} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border-none disabled:opacity-50"
                    style={{ background: "rgba(181,51,51,0.08)", color: "var(--error)", boxSizing: "border-box" }}
                    onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "rgba(181,51,51,0.14)"; }}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(181,51,51,0.08)")}
                  >{deleting ? "Removing..." : "Remove Selected"}</button>
                  <button onClick={handleSaveAll} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border-none"
                    style={{ background: "var(--accent)", color: "#faf9f5" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-h)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
                  >Save All</button>
                </>
              )}
            </div>

            {/* 第二页 */}
            <div style={{ minWidth: "100%", flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {isSingle ? (
                <>
                  <button onClick={handleCopyPrompt} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border"
                    style={{ background: "var(--sand)", color: "var(--fg)", borderColor: "var(--border)", boxSizing: "border-box" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.boxShadow = "0 1px 4px var(--card-shadow)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--sand)"; e.currentTarget.style.boxShadow = "none"; }}
                  >Copy Prompt</button>
                  <button onClick={handleFork} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border"
                    style={{ background: "var(--sand)", color: "var(--accent)", borderColor: "var(--border)", boxSizing: "border-box" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.boxShadow = "0 1px 4px var(--card-shadow)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--sand)"; e.currentTarget.style.boxShadow = "none"; }}
                  >Fork from Here</button>
                  <button onClick={() => setEditingMask({ type: "generated", imageId: singleImage!.id })} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border-none"
                    style={{ background: "var(--accent)", color: "#faf9f5" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-h)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
                  >Inpaint</button>
                </>
              ) : (
                <>
                  <button onClick={handleCopyPrompts} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border"
                    style={{ background: "var(--sand)", color: "var(--fg)", borderColor: "var(--border)", boxSizing: "border-box" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.boxShadow = "0 1px 4px var(--card-shadow)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--sand)"; e.currentTarget.style.boxShadow = "none"; }}
                  >Copy Prompts</button>
                  <button onClick={handleForkLast} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border"
                    style={{ background: "var(--sand)", color: "var(--accent)", borderColor: "var(--border)", boxSizing: "border-box" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.boxShadow = "0 1px 4px var(--card-shadow)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--sand)"; e.currentTarget.style.boxShadow = "none"; }}
                  >Fork from Last</button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 页码指示器 */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
          {[0, 1].map((p) => (
            <button
              key={p}
              onClick={() => setButtonPage(p)}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: buttonPage === p ? "var(--accent)" : "var(--border)",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
        </div>
      </div>

      {/* MaskEditor Overlay */}
      {editingMask && activeSessionId && (
        <MaskEditor
          source={editingMask}
          onClose={() => setEditingMask(null)}
          onGenerate={(maskB64, prompt) => {
            import("../services/api").then(({ inpaintImage }) => {
              const req = editingMask.type === "generated"
                ? { session_id: activeSessionId, prompt, source_image_id: editingMask.imageId, mask_b64: maskB64 }
                : { session_id: activeSessionId, prompt, source_image_b64: editingMask.imageB64, mask_b64: maskB64 };
              inpaintImage(
                req,
                () => {
                  setEditingMask(null);
                  Promise.all([fetchSessions(), selectSession(activeSessionId)]);
                },
                (code, msg) => {
                  console.error("Inpaint failed:", code, msg);
                }
              );
            });
          }}
        />
      )}

      {/* Full-resolution viewer overlay */}
      {viewingImage && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 9999, background: "var(--overlay)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
          onClick={() => setViewingImage(null)}
        >
          <div
            className="relative"
            style={{ maxWidth: "92vw", maxHeight: "92vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={getImageFileUrl(viewingImage.id)}
              alt={`Step ${viewingImage.step}`}
              style={{ maxWidth: "92vw", maxHeight: "90vh", objectFit: "contain", borderRadius: "var(--radius-lg)", boxShadow: "0 8px 40px rgba(0,0,0,0.4)" }}
            />
            <button
              onClick={() => setViewingImage(null)}
              className="absolute -top-3 -right-3 flex items-center justify-center cursor-pointer"
              style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 2px 8px rgba(0,0,0,0.15)", color: "var(--fg)", fontSize: 14, fontWeight: 600 }}
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* 3D stacked photo preview — last selected at front (nearest) */
function MultiPreview({ images }: { images: Image[] }) {
  const reversed = [...images].reverse();
  const total = reversed.length;
  const maxReal = 3;
  const needsGlass = total > maxReal;
  const displayCount = needsGlass ? maxReal + 1 : total;
  const realCount = needsGlass ? maxReal : total;

  // dynamic params: farthest (i = displayCount-1) is flat, nearest (i = 0) has max tilt
  const maxAngle = displayCount <= 2 ? 14 : 20;
  const maxOffset = displayCount <= 2 ? 60 : displayCount <= 3 ? 90 : 110;

  const getLayerStyle = (i: number): React.CSSProperties => {
    const t = displayCount <= 1 ? 0 : i / (displayCount - 1); // 0=nearest, 1=farthest
    const tx = -t * maxOffset;
    const ry = -(maxAngle * (1 - t)); // nearest = maxAngle, farthest = 0
    const s = Math.max(0.5, 1 - t * 0.12);
    const op = Math.max(0.2, 1 - t * 0.3);
    const blur = t * 2;

    return {
      top: "50%",
      left: "50%",
      width: "72%",
      maxHeight: "85%",
      transform: `translate(-30%, -50%) translateX(${tx}px) rotateY(${ry}deg) scale(${s})`,
      opacity: op,
      filter: blur > 0.2 ? `blur(${blur}px)` : "none",
      zIndex: displayCount - i,
      transition: "transform 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.4s, filter 0.4s",
      transformOrigin: "right center",
      borderRadius: "var(--radius-md)",
      overflow: "hidden",
      boxShadow: `0 ${4 + i * 3}px ${10 + i * 5}px rgba(0,0,0,${0.08 + t * 0.12})`,
      border: "1px solid var(--border-s)",
    };
  };

  return (
    <div
      className="relative"
      style={{ height: 220, perspective: 800, perspectiveOrigin: "68% 50%" }}
    >
      {reversed.slice(0, realCount).map((img, i) => (
        <div key={img.id} className="absolute" style={getLayerStyle(i)}>
          <img
            src={getImageFileUrl(img.id)}
            alt={`Step ${img.step}`}
            style={{ width: "100%", display: "block", background: "var(--sand)", aspectRatio: "1" }}
          />
        </div>
      ))}
      {needsGlass && (
        <div
          className="absolute"
          style={{
            ...getLayerStyle(maxReal),
            background: "linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.08) 100%)",
            backdropFilter: "blur(8px) saturate(1.2)",
            WebkitBackdropFilter: "blur(8px) saturate(1.2)",
            border: "1px solid rgba(255,255,255,0.3)",
            boxShadow: `
              0 8px 32px rgba(0,0,0,0.1),
              inset 0 1px 0 rgba(255,255,255,0.4),
              inset 0 -1px 0 rgba(255,255,255,0.1)
            `,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            aspectRatio: "1",
            color: "var(--faint)",
            fontSize: 20,
          }}
        >
          <span style={{ opacity: 0.6, fontWeight: 500, letterSpacing: 1 }}>
            +{total - maxReal}
          </span>
        </div>
      )}
    </div>
  );
}

function getCommonValue(images: Image[], field: keyof Image): string {
  const values = new Set(images.map((img) => img[field]));
  return values.size === 1 ? String([...values][0]) : "Mixed";
}
