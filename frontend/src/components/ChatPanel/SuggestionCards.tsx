import { useTranslation } from "react-i18next";
import { AiBlockSuggestions } from "../../types";
import { useGenerationStore } from "../../stores/generationStore";
import { useLLMChatStore } from "../../stores/llmChatStore";
import { useSessionStore } from "../../stores/sessionStore";

interface Props {
  block: AiBlockSuggestions;
}

export default function SuggestionCards({ block }: Props) {
  const { t } = useTranslation();

  const handleUseForGeneration = (prompt: string) => {
    const sessionId = useSessionStore.getState().activeSessionId;
    if (!sessionId) return;
    const images = useGenerationStore.getState().attachments.map((a) => ({
      type: "base64" as const,
      data: a.data,
      media_type: a.media_type,
    }));
    useGenerationStore.getState().startGeneration(sessionId, prompt, undefined, images);
  };

  const handleEditAndUse = (prompt: string) => {
    window.dispatchEvent(new CustomEvent("llm:edit-prompt", { detail: prompt }));
    useLLMChatStore.getState().toggleAI();
  };

  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
      {block.message && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>{block.message}</div>
      )}
      {block.items.map((item) => (
        <div
          key={item.id}
          style={{
            border: `1px solid ${item.recommended ? "var(--accent)" : "var(--border)"}`,
            borderRadius: "var(--radius-sm)",
            padding: 10,
            background: item.recommended ? "rgba(201,100,66,0.04)" : "var(--card-bg)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)" }}>
              {item.title}
            </span>
            {item.recommended && (
              <span
                style={{
                  fontSize: 10,
                  color: "var(--accent)",
                  background: "rgba(201,100,66,0.1)",
                  padding: "1px 6px",
                  borderRadius: 4,
                }}
              >
                {t("llm.recommended")}
              </span>
            )}
          </div>
          <p
            style={{
              fontSize: 11,
              color: "var(--muted)",
              margin: 0,
              lineHeight: 1.5,
              maxHeight: 48,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {item.prompt}
          </p>
          <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => handleEditAndUse(item.prompt)}
              style={{ fontSize: 11, padding: "3px 12px", background: "var(--card-bg)", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}
            >
              {t("llm.editAndUse")}
            </button>
            <button
              onClick={() => handleUseForGeneration(item.prompt)}
              style={{ fontSize: 11, padding: "3px 12px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}
            >
              {t("llm.useForGeneration")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
