import { useSessionStore } from "../stores/sessionStore";
import { useGenerationStore } from "../stores/generationStore";
import { getImageFileUrl } from "../services/api";

export default function Gallery() {
  const { images, selectedImageId, selectImage, loading } = useSessionStore();
  const { isGenerating, partialImage } = useGenerationStore();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#94a3b8]">
        Loading...
      </div>
    );
  }

  if (images.length === 0 && !isGenerating) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#94a3b8] text-sm">
        Generate an image to get started
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {images.map((img) => (
          <div
            key={img.id}
            onClick={() => selectImage(img.id)}
            className={`relative rounded-lg overflow-hidden cursor-pointer group transition-all ${
              selectedImageId === img.id
                ? "ring-2 ring-[#3b82f6] shadow-lg shadow-blue-500/20"
                : "hover:ring-1 hover:ring-[#334155]"
            }`}
          >
            <img
              src={getImageFileUrl(img.id)}
              alt={`Step ${img.step}`}
              className="w-full aspect-square object-cover bg-[#1e293b]"
              loading="lazy"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
              <div className="text-xs text-white/80">Step {img.step}</div>
              <div className="text-xs text-white/60 truncate">
                {img.prompt}
              </div>
            </div>
          </div>
        ))}

        {isGenerating && (
          <div className="relative rounded-lg overflow-hidden bg-[#1e293b] aspect-square flex items-center justify-center ring-2 ring-[#3b82f6]/50">
            {partialImage ? (
              <>
                <img
                  src={partialImage}
                  alt="Generating..."
                  className="w-full h-full object-cover animate-pulse"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <div className="text-white text-sm font-medium">Generating...</div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-[#3b82f6] border-t-transparent rounded-full animate-spin" />
                <div className="text-[#94a3b8] text-sm">Generating...</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
