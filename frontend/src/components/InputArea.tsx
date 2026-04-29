import { useState, useRef, useCallback } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { useGenerationStore } from "../stores/generationStore";
import type { AttachedFile } from "../types";

export default function InputArea() {
  const { activeSessionId } = useSessionStore();
  const {
    isGenerating,
    attachments,
    error,
    addAttachment,
    removeAttachment,
    startGeneration,
    cancelGeneration,
    clearAttachments,
    clearError,
    pendingForkFrom,
    setPendingForkFrom,
  } = useGenerationStore();

  const [prompt, setPrompt] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAttach = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;

        const data = await fileToBase64(file);
        const attachment: AttachedFile = {
          id: crypto.randomUUID(),
          name: file.name,
          data,
          media_type: file.type,
          preview_url: `data:${file.type};base64,${data}`,
        };
        addAttachment(attachment);
      }
      e.target.value = "";
    },
    [addAttachment]
  );

  const handleGenerate = () => {
    if (!activeSessionId || !prompt.trim() || isGenerating) return;
    startGeneration(activeSessionId, prompt.trim(), pendingForkFrom || undefined);
    setPrompt("");
    clearAttachments();
    setPendingForkFrom(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleGenerate();
    }
  };

  const handleTextareaInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  };

  return (
    <div className="border-t border-[#334155] bg-[#0f172a]">
      {/* Error bar */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex items-center justify-between">
          <span className="text-red-400 text-sm">{error}</span>
          <button
            onClick={clearError}
            className="text-red-400 hover:text-red-300 cursor-pointer"
          >
            x
          </button>
        </div>
      )}

      {/* Fork indicator */}
      {pendingForkFrom && (
        <div className="px-4 py-1.5 bg-blue-500/10 border-b border-blue-500/20 flex items-center justify-between">
          <span className="text-blue-400 text-xs">Forking from {pendingForkFrom.slice(0, 16)}...</span>
          <button
            onClick={() => setPendingForkFrom(null)}
            className="text-blue-400 hover:text-blue-300 cursor-pointer text-xs"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Attachment preview area */}
      {attachments.length > 0 && (
        <div className="px-4 pt-3 max-h-[40vh] overflow-y-auto">
          <div className="flex flex-wrap gap-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative group w-16 h-16 rounded-lg overflow-hidden border border-[#334155]"
              >
                <img
                  src={att.preview_url}
                  alt={att.name}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Text input */}
      <div className="px-4 py-2">
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleTextareaInput}
          placeholder={
            activeSessionId
              ? "Describe the image you want to generate... (Ctrl+Enter to send)"
              : "Select or create a session first"
          }
          disabled={!activeSessionId}
          rows={1}
          className="w-full bg-[#1e293b] border border-[#334155] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#64748b] resize-none outline-none focus:border-[#3b82f6] transition-colors disabled:opacity-50"
          style={{ minHeight: "40px", maxHeight: "120px" }}
        />
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-3 flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          onClick={handleAttach}
          disabled={isGenerating}
          className="px-3 py-1.5 text-sm text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#1e293b] rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
          title="Attach image"
        >
          Attach
        </button>

        <button
          onClick={() => setShowSettings(true)}
          className="px-3 py-1.5 text-sm text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#1e293b] rounded-lg transition-colors cursor-pointer"
          title="Settings"
        >
          Settings
        </button>

        <div className="flex-1" />

        {isGenerating && (
          <button
            onClick={cancelGeneration}
            className="px-4 py-1.5 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
        )}

        <button
          onClick={handleGenerate}
          disabled={!activeSessionId || !prompt.trim() || isGenerating}
          className="px-4 py-1.5 text-sm bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-medium"
        >
          Generate
        </button>
      </div>

      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const { updateApiKey } = await import("../services/api");
      await updateApiKey(apiKey.trim());
      setMessage("API Key saved");
      setTimeout(onClose, 800);
    } catch (err) {
      setMessage(`Error: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1e293b] rounded-lg border border-[#334155] p-6 w-[400px] shadow-xl">
        <h3 className="text-lg font-medium text-[#e2e8f0] mb-4">Settings</h3>

        <label className="block text-sm text-[#94a3b8] mb-1">OpenAI API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className="w-full bg-[#0f172a] border border-[#334155] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#64748b] outline-none focus:border-[#3b82f6] mb-4"
        />

        {message && (
          <div className="text-sm text-[#94a3b8] mb-3">{message}</div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-[#94a3b8] hover:text-[#e2e8f0] rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!apiKey.trim() || saving}
            className="px-4 py-1.5 text-sm bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
