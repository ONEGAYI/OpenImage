import { useSessionStore } from "../stores/sessionStore";
import { useGenerationStore } from "../stores/generationStore";
import { getImageFileUrl } from "../services/api";

export default function DetailPanel() {
  const { images, selectedImageId } = useSessionStore();
  const { setPendingForkFrom } = useGenerationStore();
  const selectedImage = images.find((img) => img.id === selectedImageId);

  if (!selectedImage) {
    return (
      <div className="flex items-center justify-center border-l" style={{ width: "var(--detail-w)", minWidth: "var(--detail-w)", background: "var(--surface)", borderColor: "var(--border)", color: "var(--faint)", fontSize: 13 }}>
        Select an image
      </div>
    );
  }

  const handleSave = async () => {
    const url = getImageFileUrl(selectedImage.id);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openimage_step${selectedImage.step}.png`;
    a.click();
  };

  const handleCopyPrompt = () => { navigator.clipboard.writeText(selectedImage.prompt); };
  const handleFork = () => { setPendingForkFrom(selectedImage.id); };

  const labelStyle: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--faint)", marginBottom: 4 };

  return (
    <div className="flex flex-col h-full overflow-y-auto border-l" style={{ width: "var(--detail-w)", minWidth: "var(--detail-w)", maxWidth: "var(--detail-w)", background: "var(--surface)", borderColor: "var(--border)", boxSizing: "border-box", transition: "background 0.3s, border-color 0.3s" }}>
      <div className="border-b overflow-hidden" style={{ padding: 16, borderColor: "var(--border-s)" }}>
        <img src={getImageFileUrl(selectedImage.id)} alt={`Step ${selectedImage.step}`} className="w-full" style={{ borderRadius: "var(--radius-md)", background: "var(--sand)", display: "block" }} />
      </div>
      <div className="p-4 flex flex-col gap-3.5 flex-1">
        <div><div style={labelStyle}>Step</div><div className="text-[13px]" style={{ color: "var(--fg)" }}>{selectedImage.step}</div></div>
        <div><div style={labelStyle}>Prompt</div><div className="text-[13px] leading-[1.6]" style={{ color: "var(--muted)" }}>{selectedImage.prompt}</div></div>
        {selectedImage.revised_prompt && <div><div style={labelStyle}>Revised Prompt</div><div className="text-[13px] leading-[1.6] italic" style={{ color: "var(--muted)" }}>{selectedImage.revised_prompt}</div></div>}
        <div className="flex gap-4">
          {[{ label: "Size", value: selectedImage.size }, { label: "Quality", value: selectedImage.quality }, { label: "Format", value: selectedImage.output_format }].map(({ label, value }) => (
            <div key={label} className="flex-1"><div style={labelStyle}>{label}</div><div className="text-[13px]" style={{ color: "var(--fg)" }}>{value}</div></div>
          ))}
        </div>
        <div><div style={labelStyle}>Created</div><div className="text-[13px]" style={{ color: "var(--fg)" }}>{new Date(selectedImage.created_at).toLocaleString()}</div></div>
      </div>
      <div className="border-t flex flex-col gap-2 mt-auto" style={{ padding: 16, borderColor: "var(--border-s)", boxSizing: "border-box" }}>
        <button onClick={handleSave} className="w-full py-[9px] px-4 rounded-lg text-[13px] font-medium text-center transition-all cursor-pointer border-none"
          style={{ background: "var(--accent)", color: "#faf9f5" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-h)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
        >Save Image</button>
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
      </div>
    </div>
  );
}
