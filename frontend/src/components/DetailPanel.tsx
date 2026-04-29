import { useSessionStore } from "../stores/sessionStore";
import { useGenerationStore } from "../stores/generationStore";
import { getImageFileUrl } from "../services/api";

export default function DetailPanel() {
  const { images, selectedImageId } = useSessionStore();
  const { startGeneration } = useGenerationStore();

  const selectedImage = images.find((img) => img.id === selectedImageId);

  if (!selectedImage) {
    return (
      <div className="w-[280px] min-w-[280px] bg-[#0f172a] border-l border-[#334155] flex items-center justify-center">
        <span className="text-[#94a3b8] text-sm">Select an image</span>
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

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(selectedImage.prompt);
  };

  const handleFork = () => {
    const sessionId = selectedImage.session_id;
    const prompt = "";
    startGeneration(sessionId, prompt, selectedImage.id);
  };

  return (
    <div className="w-[280px] min-w-[280px] bg-[#0f172a] border-l border-[#334155] flex flex-col h-full overflow-y-auto">
      {/* Image preview */}
      <div className="p-3">
        <img
          src={getImageFileUrl(selectedImage.id)}
          alt={`Step ${selectedImage.step}`}
          className="w-full rounded-lg bg-[#1e293b]"
        />
      </div>

      {/* Metadata */}
      <div className="px-4 pb-3 space-y-3">
        <div>
          <div className="text-xs text-[#64748b] uppercase tracking-wide mb-1">
            Step
          </div>
          <div className="text-sm text-[#e2e8f0]">{selectedImage.step}</div>
        </div>

        <div>
          <div className="text-xs text-[#64748b] uppercase tracking-wide mb-1">
            Prompt
          </div>
          <div className="text-sm text-[#94a3b8] leading-relaxed">
            {selectedImage.prompt}
          </div>
        </div>

        {selectedImage.revised_prompt && (
          <div>
            <div className="text-xs text-[#64748b] uppercase tracking-wide mb-1">
              Revised Prompt
            </div>
            <div className="text-sm text-[#94a3b8] leading-relaxed">
              {selectedImage.revised_prompt}
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <div>
            <div className="text-xs text-[#64748b] uppercase tracking-wide mb-1">
              Size
            </div>
            <div className="text-sm text-[#e2e8f0]">{selectedImage.size}</div>
          </div>
          <div>
            <div className="text-xs text-[#64748b] uppercase tracking-wide mb-1">
              Quality
            </div>
            <div className="text-sm text-[#e2e8f0]">{selectedImage.quality}</div>
          </div>
          <div>
            <div className="text-xs text-[#64748b] uppercase tracking-wide mb-1">
              Format
            </div>
            <div className="text-sm text-[#e2e8f0]">
              {selectedImage.output_format}
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs text-[#64748b] uppercase tracking-wide mb-1">
            Created
          </div>
          <div className="text-sm text-[#e2e8f0]">
            {new Date(selectedImage.created_at).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-auto px-4 pb-4 space-y-2">
        <button
          onClick={handleSave}
          className="w-full px-3 py-2 text-sm bg-[#1e293b] hover:bg-[#334155] text-[#e2e8f0] rounded-lg transition-colors cursor-pointer"
        >
          Save Image
        </button>
        <button
          onClick={handleCopyPrompt}
          className="w-full px-3 py-2 text-sm bg-[#1e293b] hover:bg-[#334155] text-[#e2e8f0] rounded-lg transition-colors cursor-pointer"
        >
          Copy Prompt
        </button>
        <button
          onClick={handleFork}
          className="w-full px-3 py-2 text-sm bg-[#1e293b] hover:bg-[#334155] text-[#3b82f6] rounded-lg transition-colors cursor-pointer"
        >
          Fork from Here
        </button>
      </div>
    </div>
  );
}
