import { useTranslation } from "react-i18next";
import { useLLMChatStore } from "../stores/llmChatStore";

export default function AiToggle() {
  const { t } = useTranslation();
  const aiEnabled = useLLMChatStore((s) => s.aiEnabled);
  const toggleAI = useLLMChatStore((s) => s.toggleAI);

  return (
    <button
      onClick={toggleAI}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        borderRadius: "var(--radius-sm)",
        border: `1px solid ${aiEnabled ? "var(--accent)" : "var(--border)"}`,
        background: aiEnabled ? "rgba(201,100,66,0.08)" : "transparent",
        color: aiEnabled ? "var(--accent)" : "var(--faint)",
        fontSize: 11,
        cursor: "pointer",
        transition: "all 0.2s ease",
        whiteSpace: "nowrap",
      }}
      title={aiEnabled ? t("llm.collapse") : t("llm.expand")}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: aiEnabled ? "var(--accent)" : "var(--faint)",
          transition: "background 0.2s ease",
        }}
      />
      {t("llm.toggle")}
    </button>
  );
}
