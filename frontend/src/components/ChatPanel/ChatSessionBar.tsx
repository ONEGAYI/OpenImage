import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLLMChatStore } from "../../stores/llmChatStore";
import { useSessionStore } from "../../stores/sessionStore";

export default function ChatSessionBar() {
  const { t } = useTranslation();
  const chatSessions = useLLMChatStore((s) => s.chatSessions);
  const currentChatSessionId = useLLMChatStore((s) => s.currentChatSessionId);
  const totalTokens = useLLMChatStore((s) =>
    s.chatSessions.find((cs) => cs.id === s.currentChatSessionId)?.total_tokens || 0
  );
  const setPanelExpanded = useLLMChatStore((s) => s.setPanelExpanded);
  const selectChatSession = useLLMChatStore((s) => s.selectChatSession);
  const createChatSession = useLLMChatStore((s) => s.createChatSession);
  const deleteChatSession = useLLMChatStore((s) => s.deleteChatSession);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);

  const [showManage, setShowManage] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击弹窗外部关闭
  useEffect(() => {
    if (!showManage) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowManage(false);
        setSelectedIds(new Set());
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showManage]);

  const handleNew = async () => {
    if (activeSessionId) {
      await createChatSession(activeSessionId);
    }
  };

  const handleDelete = async (chatId: string) => {
    if (activeSessionId) {
      await deleteChatSession(chatId, activeSessionId);
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(chatId);
      return next;
    });
  };

  const handleBatchDelete = async () => {
    if (!activeSessionId || selectedIds.size === 0) return;
    await Promise.all([...selectedIds].map((id) => deleteChatSession(id, activeSessionId)));
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === chatSessions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(chatSessions.map((cs) => cs.id)));
    }
  };

  const hasSelection = selectedIds.size > 0;
  const allSelected = chatSessions.length > 0 && selectedIds.size === chatSessions.length;

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
        {chatSessions.length === 0 ? (
          <option value="" disabled>{t("llm.noChats")}</option>
        ) : (
          chatSessions.map((cs) => (
            <option key={cs.id} value={cs.id}>{cs.name}</option>
          ))
        )}
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
        onClick={() => { setShowManage(!showManage); setSelectedIds(new Set()); }}
        style={{ fontSize: 11, padding: "2px 6px", background: "transparent", border: "none", cursor: "pointer", color: showManage ? "var(--accent)" : "var(--faint)" }}
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
          ref={menuRef}
          style={{
            position: "absolute",
            top: "100%",
            right: 10,
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            padding: 4,
            minWidth: 200,
            boxShadow: "0 4px 12px var(--card-shadow)",
            zIndex: 50,
          }}
        >
          {/* 工具栏 */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderBottom: "1px solid var(--border-s)", marginBottom: 2 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--muted)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                style={{ accentColor: "var(--accent)" }}
              />
              {t("llm.selectAll")}
            </label>
            {hasSelection && (
              <button
                onClick={handleBatchDelete}
                style={{
                  marginLeft: "auto",
                  fontSize: 10,
                  padding: "1px 8px",
                  color: "var(--error)",
                  background: "rgba(220,38,38,0.08)",
                  border: "1px solid rgba(220,38,38,0.2)",
                  borderRadius: 3,
                  cursor: "pointer",
                }}
              >
                {t("llm.batchDelete", { count: selectedIds.size })}
              </button>
            )}
          </div>

          {chatSessions.length === 0 ? (
            <div style={{ padding: "8px", fontSize: 11, color: "var(--faint)", textAlign: "center" as const }}>
              {t("llm.noChats")}
            </div>
          ) : (
            chatSessions.map((cs) => (
              <div
                key={cs.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 8px",
                  fontSize: 11,
                  borderRadius: 3,
                  background: selectedIds.has(cs.id) ? "rgba(201,100,66,0.06)" : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(cs.id)}
                  onChange={() => toggleSelect(cs.id)}
                  style={{ accentColor: "var(--accent)" }}
                />
                <span style={{ flex: 1, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {cs.name}
                </span>
                <button
                  onClick={() => handleDelete(cs.id)}
                  style={{ fontSize: 10, color: "var(--faint)", background: "none", border: "none", cursor: "pointer", flexShrink: 0 }}
                  title={t("llm.delete")}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
