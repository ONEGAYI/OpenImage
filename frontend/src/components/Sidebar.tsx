import { useState, useEffect, useRef } from "react";
import { useSessionStore } from "../stores/sessionStore";

export default function Sidebar() {
  const {
    sessions,
    activeSessionId,
    fetchSessions,
    selectSession,
    createSession,
    deleteSession,
    renameSession,
  } = useSessionStore();

  const [contextMenu, setContextMenu] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const editRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

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
    if (session) {
      setEditingId(id);
      setEditName(session.name);
    }
    setContextMenu(null);
  };

  const handleRenameSubmit = async () => {
    if (editingId && editName.trim()) {
      await renameSession(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteSession(id);
    setContextMenu(null);
  };

  return (
    <div className="w-[220px] min-w-[220px] bg-[#0f172a] border-r border-[#334155] flex flex-col h-full">
      <div className="p-3 border-b border-[#334155]">
        <button
          onClick={handleNew}
          className="w-full px-3 py-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
        >
          + New Session
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 && (
          <div className="p-4 text-center text-[#94a3b8] text-sm">
            No sessions yet
          </div>
        )}
        {sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => selectSession(session.id)}
            onContextMenu={(e) => handleContextMenu(e, session.id)}
            className={`px-3 py-2.5 cursor-pointer text-sm truncate transition-colors border-l-2 ${
              activeSessionId === session.id
                ? "bg-[#1e293b] border-[#3b82f6] text-[#e2e8f0]"
                : "border-transparent text-[#94a3b8] hover:bg-[#1e293b] hover:text-[#e2e8f0]"
            }`}
          >
            {editingId === session.id ? (
              <input
                ref={editRef}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameSubmit();
                  if (e.key === "Escape") setEditingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-[#0f172a] border border-[#3b82f6] rounded px-2 py-1 text-[#e2e8f0] text-sm outline-none"
              />
            ) : (
              session.name
            )}
          </div>
        ))}
      </div>

      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed bg-[#1e293b] border border-[#334155] rounded-lg shadow-xl py-1 z-50 min-w-[120px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handleRename(contextMenu.id)}
            className="w-full text-left px-3 py-1.5 text-sm text-[#e2e8f0] hover:bg-[#334155] cursor-pointer"
          >
            Rename
          </button>
          <button
            onClick={() => handleDelete(contextMenu.id)}
            className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-[#334155] cursor-pointer"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
