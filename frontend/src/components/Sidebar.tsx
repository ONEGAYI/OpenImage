import { useState, useEffect, useRef } from "react";
import { useSessionStore } from "../stores/sessionStore";
import { getImageFileUrl } from "../services/api";

export default function Sidebar() {
  const {
    sessions,
    activeSessionId,
    searchQuery,
    fetchSessions,
    selectSession,
    createSession,
    deleteSession,
    renameSession,
    setSearchQuery,
  } = useSessionStore();

  const [contextMenu, setContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    if (contextMenu) {
      const close = () => setContextMenu(null);
      document.addEventListener("click", close);
      return () => document.removeEventListener("click", close);
    }
  }, [contextMenu]);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  const handleNew = async () => {
    const name = `Session ${sessions.length + 1}`;
    await createSession(name);
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  };

  const handleRename = (id: string) => {
    const session = sessions.find((s) => s.id === id);
    if (session) { setEditingId(id); setEditName(session.name); }
    setContextMenu(null);
  };

  const handleRenameSubmit = async () => {
    if (editingId && editName.trim()) { await renameSession(editingId, editName.trim()); }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteSession(id);
    setContextMenu(null);
  };

  const filtered = searchQuery
    ? sessions.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : sessions;

  return (
    <div
      className="flex flex-col h-full border-r"
      style={{
        width: "var(--sidebar-w)", minWidth: "var(--sidebar-w)",
        background: "var(--sidebar-bg)", borderColor: "var(--border)",
        transition: "background 0.3s, border-color 0.3s",
      }}
    >
      {/* Header */}
      <div className="py-5 px-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="mb-3.5" style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, color: "var(--fg)", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          Open<span style={{ color: "var(--accent)" }}>Image</span>
        </div>
        <button
          onClick={handleNew}
          className="w-full rounded-lg text-[13px] font-medium transition-all"
          style={{ padding: "9px 16px", background: "var(--accent)", color: "#faf9f5", letterSpacing: "0.01em" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-h)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.transform = "translateY(0)"; }}
        >+ New Session</button>
      </div>

      {/* Search */}
      <div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--border-s)" }}>
        <input
          type="text" placeholder="搜索会话..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full border rounded-lg text-[12.5px] outline-none transition-all"
          style={{ padding: "7px 12px", background: "var(--input-bg)", borderColor: "var(--border)", color: "var(--fg)" }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(201,100,66,0.12)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
        />
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-1.5 px-2">
        {filtered.length === 0 && (
          <div className="py-8 px-4 text-center text-[13px] leading-relaxed" style={{ color: "var(--faint)" }}>
            {searchQuery ? "无匹配会话" : "暂无会话"}
          </div>
        )}
        {filtered.map((session) => (
          <div
            key={session.id}
            onClick={() => selectSession(session.id)}
            onContextMenu={(e) => handleContextMenu(e, session.id)}
            className="flex items-center gap-2.5 cursor-pointer relative border transition-colors"
            style={{
              padding: "10px 12px", borderRadius: "var(--radius-sm)",
              borderColor: activeSessionId === session.id ? "var(--border)" : "transparent",
              background: activeSessionId === session.id ? "var(--surface)" : "transparent",
              boxShadow: activeSessionId === session.id ? "0 0 0 1px var(--border-s), 0 1px 3px var(--card-shadow)" : "none",
            }}
            onMouseEnter={(e) => { if (activeSessionId !== session.id) e.currentTarget.style.background = "var(--sand)"; }}
            onMouseLeave={(e) => { if (activeSessionId !== session.id) e.currentTarget.style.background = "transparent"; }}
          >
            <div
              className="flex items-center justify-center flex-shrink-0 overflow-hidden"
              style={{ width: 32, height: 32, borderRadius: "var(--radius-sm)", background: activeSessionId === session.id ? "var(--accent)" : "var(--sand)" }}
            >
              {session.latest_image_id ? (
                <img src={getImageFileUrl(session.latest_image_id)} alt="" className="w-full h-full object-cover" />
              ) : (
                <svg style={{ width: 14, height: 14, color: activeSessionId === session.id ? "#faf9f5" : "var(--faint)" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {editingId === session.id ? (
                <input
                  ref={editRef} value={editName} onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRenameSubmit(); if (e.key === "Escape") setEditingId(null); }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full border rounded px-2 py-0.5 text-sm outline-none"
                  style={{ background: "var(--input-bg)", borderColor: "var(--accent)", color: "var(--fg)" }}
                />
              ) : (
                <>
                  <div className="text-[13px] font-medium truncate" style={{ color: "var(--fg)" }}>{session.name}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--faint)" }}>{session.image_count ?? 0} images</div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 p-1 min-w-[140px]"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", boxShadow: "0 4px 20px var(--card-shadow)", left: contextMenu.x, top: contextMenu.y }}
        >
          <button onClick={() => handleRename(contextMenu.id)} className="w-full text-left px-3 py-1.5 text-[13px] rounded-md transition-colors" style={{ color: "var(--fg)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sand)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >Rename</button>
          <button onClick={() => handleDelete(contextMenu.id)} className="w-full text-left px-3 py-1.5 text-[13px] rounded-md transition-colors" style={{ color: "var(--error)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(181,51,51,0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >Delete</button>
        </div>
      )}
    </div>
  );
}
