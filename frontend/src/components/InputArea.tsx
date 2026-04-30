import { useState, useRef, useCallback } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { useGenerationStore } from "../stores/generationStore";
import { inpaintImage } from "../services/api";
import type { AttachedFile } from "../types";
import MaskEditor from "./MaskEditor";

interface InputAreaProps {
  onOpenSettings?: () => void;
}

export default function InputArea({ onOpenSettings }: InputAreaProps) {
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
  const [editingAttachment, setEditingAttachment] = useState<AttachedFile | null>(null);
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
    startGeneration(
      activeSessionId,
      prompt.trim(),
      pendingForkFrom || undefined,
      () => {
        setPrompt("");
        clearAttachments();
        setPendingForkFrom(null);
      }
    );
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
      el.style.height = Math.min(el.scrollHeight, 100) + "px";
    }
  };

  return (
    <div
      className="border-t flex flex-col gap-2"
      style={{
        background: "var(--bg)",
        borderColor: "var(--border)",
        padding: "12px 20px 14px",
        transition: "background 0.3s, border-color 0.3s",
      }}
    >
      {error && (
        <div
          className="flex items-center justify-between px-3 py-2 rounded-lg"
          style={{ background: "rgba(181,51,51,0.08)", border: "1px solid rgba(181,51,51,0.2)" }}
        >
          <span className="text-sm" style={{ color: "var(--error)" }}>{error}</span>
          <button onClick={clearError} className="cursor-pointer text-sm" style={{ color: "var(--error)" }}>x</button>
        </div>
      )}

      {pendingForkFrom && (
        <div
          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs"
          style={{ background: "rgba(201,100,66,0.08)", border: "1px solid rgba(201,100,66,0.15)", color: "var(--accent)" }}
        >
          <span>Forking from {pendingForkFrom.slice(0, 16)}...</span>
          <button onClick={() => setPendingForkFrom(null)} className="cursor-pointer text-xs" style={{ color: "var(--accent)" }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
          >Cancel</button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {attachments.map((att) => (
            <div key={att.id} className="relative flex-shrink-0 overflow-hidden border group"
              style={{ width: 52, height: 52, borderRadius: "var(--radius-sm)", borderColor: "var(--border)", background: "var(--sand)" }}
            >
              <img src={att.preview_url} alt={att.name} className="w-full h-full object-cover" />
              {/* 编辑图标（左下角） */}
              <button
                onClick={(e) => { e.stopPropagation(); setEditingAttachment(att); }}
                className="absolute bottom-0.5 left-0.5 w-[20px] h-[20px] rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                style={{ background: "rgba(20,20,19,0.6)" }}
                title="Inpaint this image"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M12 19l7-7 3 3-7 7-3-3z" />
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                </svg>
              </button>
              <button
                onClick={() => removeAttachment(att.id)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                style={{ background: "rgba(20,20,19,0.6)", fontSize: 10 }}
              >&times;</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 pb-0.5">
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
        <button
          onClick={handleAttach} disabled={isGenerating}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors disabled:opacity-50 cursor-pointer"
          style={{ color: "var(--muted)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sand)"; e.currentTarget.style.color = "var(--fg)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--muted)"; }}
          title="Attach image"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
          Attach
        </button>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer"
            style={{ color: "var(--muted)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sand)"; e.currentTarget.style.color = "var(--fg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--muted)"; }}
            title="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
            Settings
          </button>
        )}
        <span className="flex-1" />
        <span className="text-[11px] leading-6" style={{ color: "var(--faint)" }}>Ctrl+Enter to send</span>
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleTextareaInput}
            placeholder={activeSessionId ? "Describe the image you want to generate..." : "Select or create a session first"}
            disabled={!activeSessionId}
            rows={1}
            className="w-full border outline-none resize-none transition-all"
            style={{
              padding: "9px 14px", background: "var(--input-bg)", borderColor: "var(--border)",
              borderRadius: "var(--radius-md)", color: "var(--fg)", fontSize: "13.5px", lineHeight: 1.5,
              minHeight: "40px", maxHeight: "100px",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(201,100,66,0.1)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
          />
        </div>
        {isGenerating ? (
          <button
            onClick={cancelGeneration}
            className="rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors cursor-pointer"
            style={{ padding: "9px 18px", background: "rgba(181,51,51,0.08)", color: "var(--error)", border: "1px solid rgba(181,51,51,0.2)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(181,51,51,0.14)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(181,51,51,0.08)")}
          >Cancel</button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={!activeSessionId || !prompt.trim()}
            className="rounded-lg text-[13px] font-medium whitespace-nowrap transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ padding: "9px 22px", background: "var(--accent)", color: "#faf9f5" }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.background = "var(--accent-h)";
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(201,100,66,0.2)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--accent)";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >Generate</button>
        )}
      </div>

      {editingAttachment && activeSessionId && (
        <MaskEditor
          source={{ type: "attachment", attachmentId: editingAttachment.id, imageB64: editingAttachment.data }}
          onClose={() => setEditingAttachment(null)}
          onGenerate={(maskB64, prompt) => {
            const store = useSessionStore.getState();
            inpaintImage(
              {
                session_id: activeSessionId,
                prompt,
                source_image_b64: editingAttachment.data,
                mask_b64: maskB64,
              },
              () => {
                setEditingAttachment(null);
                Promise.all([store.fetchSessions(), store.selectSession(activeSessionId)]);
              },
              (code, msg) => {
                console.error("Inpaint failed:", code, msg);
              }
            );
          }}
        />
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
