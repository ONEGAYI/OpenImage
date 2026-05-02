import { useTranslation } from "react-i18next";
import { useSessionStore } from "../stores/sessionStore";
import { useGenerationStore } from "../stores/generationStore";
import { getImageFileUrl } from "../services/api";

export default function Gallery() {
  const { t } = useTranslation();
  const { images, selectedImageIds, selectImage, toggleImageSelect, loading, activeSessionId } = useSessionStore();
  const sid = activeSessionId ?? "";
  const isGenerating = useGenerationStore((s) => s.sessionGenerations[sid]?.isGenerating ?? false);
  const partialImage = useGenerationStore((s) => s.sessionGenerations[sid]?.partialImage ?? null);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center" style={{ color: "var(--faint)" }}>{t("gallery.loading")}</div>;
  }

  if (images.length === 0 && !isGenerating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-10 text-center" style={{ color: "var(--faint)" }}>
        <div className="flex items-center justify-center mb-1" style={{ width: 64, height: 64, borderRadius: "var(--radius-xl)", background: "var(--sand)", fontSize: 28 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.4">
            <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
          </svg>
        </div>
        <h3 className="font-semibold" style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--muted)" }}>{t("gallery.emptyTitle")}</h3>
        <p className="text-[13px] max-w-[300px] leading-relaxed">{t("gallery.emptySubtitle")}</p>
      </div>
    );
  }

  const handleClick = (e: React.MouseEvent, imgId: string) => {
    if (e.ctrlKey || e.metaKey) {
      toggleImageSelect(imgId);
    } else {
      selectImage(imgId);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
        {images.map((img) => {
          const isSelected = selectedImageIds.includes(img.id);
          return (
            <div
              key={img.id}
              onClick={(e) => handleClick(e, img.id)}
              className="relative overflow-hidden cursor-pointer transition-all"
              style={{
                borderRadius: "var(--radius-md)", background: "var(--card-bg)", aspectRatio: "1",
                border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border-s)",
                boxShadow: isSelected ? "0 0 0 2px var(--accent), 0 4px 16px var(--card-shadow)" : "none",
                transform: isSelected ? "scale(1.02)" : "none",
              }}
              onMouseEnter={(e) => {
                if (!isSelected) { e.currentTarget.style.boxShadow = "0 0 0 1px var(--border), 0 4px 16px var(--card-shadow)"; e.currentTarget.style.transform = "translateY(-2px)"; }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "translateY(0)"; }
              }}
            >
              <img src={getImageFileUrl(img.id)} alt={t("gallery.step", { step: img.step })} className="w-full h-full object-cover" style={{ background: "var(--sand)" }} loading="lazy" />
              {isSelected && (
                <div
                  className="absolute top-2 right-2 flex items-center justify-center"
                  style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: "var(--accent)", color: "#faf9f5",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 px-3 pt-6 pb-2.5" style={{ background: "linear-gradient(to top, rgba(20,20,19,0.65), transparent)", color: "#faf9f5" }}>
                <div className="font-medium" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.03em", opacity: 0.9 }}>{t("gallery.step", { step: img.step })}</div>
                <div className="truncate mt-0.5" style={{ fontSize: 11.5, opacity: 0.75 }}>{img.prompt}</div>
              </div>
            </div>
          );
        })}
        {isGenerating && (
          <div className="flex items-center justify-center" style={{ borderRadius: "var(--radius-md)", border: "2px dashed var(--accent)", background: "var(--surface)", aspectRatio: "1" }}>
            {partialImage ? (
              <div className="relative w-full h-full">
                <img src={partialImage} alt={t("common.generating")} className="w-full h-full object-cover animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.3)" }}>
                  <span className="text-white text-sm font-medium">{t("common.generating")}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3" style={{ color: "var(--muted)" }}>
                <div className="rounded-full animate-spin" style={{ width: 32, height: 32, border: "2.5px solid var(--border)", borderTopColor: "var(--accent)" }} />
                <div className="text-xs" style={{ color: "var(--faint)" }}>{t("common.generating")}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
