import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLLMChatStore } from "../../stores/llmChatStore";
import { useSessionStore } from "../../stores/sessionStore";

export default function ChatSessionBar() {
  const { t } = useTranslation();
  const chatSessions = useLLMChatStore((s) => s.chatSessions);
  const currentChatSessionId = useLLMChatStore((s) => s.currentChatSessionId);
  const totalTokens = useLLMChatStore((s) => s.totalTokens);
  const setPanelExpanded = useLLMChatStore((s) => s.setPanelExpanded);
  const selectChatSession = useLLMChatStore((s) => s.selectChatSession);
  const createChatSession = useLLMChatStore((s) => s.createChatSession);
  const deleteChatSession = useLLMChatStore((s) => s.deleteChatSession);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  const [showManage, setShowManage] = useState(false);

  const handleNew = async () => {
    if (activeSessionId) {
      await createChatSession(activeSessionId);
    }
  };

  const handleDelete = async (chatId: string) => {
    if (activeSessionId) {
      await deleteChatSession(chatId, activeSessionId);
    }
    setShowManage(false);
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 10px",
        borderBottom: "1px solid var(--border-s)",
        fontSize: 12,
      }}
    >
      <select
        value={currentChatSessionId || ""}
        onChange={(e) => e.target.value && selectChatSession(e.target.value)}
        style={{
          flex: 1,
          padding: "2px 6px",
          border: "1px solid var(--border)",
          borderRadius: 4,
          fontSize: 11,
          color: "var(--fg)",
          background: "var(--input-bg)",
        }}
      >
        {chatSessions.map((cs) => (
          <option key={cs.id} value={cs.id}>{cs.name}</option>
        ))}
      </select>

      <span style={{ fontSize: 10, color: "var(--faint)", whiteSpace: "nowrap" }}>
        {t("llm.tokenCount", { count: totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens })}
      </span>

      <button
        onClick={handleNew}
        style={{ fontSize: 11, padding: "2px 8px", background: "transparent", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", color: "var(--muted)" }}
      >
        + {t("llm.newChat")}
      </button>

      <button
        onClick={() => setShowManage(!showManage)}
        style={{ fontSize: 11, padding: "2px 6px", background: "transparent", border: "none", cursor: "pointer", color: "var(--faint)" }}
      >
        {t("llm.manage")}
      </button>

      <button
        onClick={() => setPanelExpanded(false)}
        style={{ fontSize: 11, padding: "2px 6px", background: "transparent", border: "none", cursor: "pointer", color: "var(--faint)" }}
      >
        {t("llm.collapse")}
      </button>

      {showManage && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 10,
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: 4,
            minWidth: 140,
            boxShadow: "0 4px 12px var(--card-shadow)",
            zIndex: 50,
          }}
        >
          {chatSessions.map((cs) => (
            <div
              key={cs.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "4px 8px",
                fontSize: 11,
              }}
            >
              <span style={{ color: "var(--muted)" }}>{cs.name}</span>
              <button
                onClick={() => handleDelete(cs.id)}
                style={{ fontSize: 10, color: "var(--error)", background: "none", border: "none", cursor: "pointer" }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
