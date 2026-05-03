import { useSessionStore } from "../stores/sessionStore";
import { useTheme } from "../hooks/useTheme";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";

interface TopbarProps {
  onOpenSettings: () => void;
}

export default function Topbar({ onOpenSettings }: TopbarProps) {
  const { sessions, activeSessionId } = useSessionStore();
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const title = activeSession?.name ?? "OpenImage";

  return (
    <header
      className="flex items-center justify-between px-5 border-b"
      style={{
        height: "var(--topbar-h)",
        minHeight: "var(--topbar-h)",
        borderColor: "var(--border-s)",
        background: "var(--bg)",
        transition: "background 0.3s, border-color 0.3s",
      }}
    >
      <div
        className="font-semibold"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "16px",
          color: "var(--fg)",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </div>

      <div className="flex items-center gap-1.5">
        <LanguageSwitcher />

        <button
          onClick={onOpenSettings}
          className="flex items-center justify-center rounded-lg transition-colors"
          style={{
            width: 34,
            height: 34,
            color: "var(--muted)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--sand)";
            e.currentTarget.style.color = "var(--fg)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "none";
            e.currentTarget.style.color = "var(--muted)";
          }}
          title={t("topbar.settings")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>

        <button
          onClick={toggleTheme}
          className="relative rounded-[14px] cursor-pointer border overflow-hidden"
          style={{
            width: 50,
            height: 28,
            background: "var(--sand)",
            borderColor: "var(--border)",
            transition: "background 0.3s",
            padding: 0,
          }}
          title={t("topbar.toggleTheme")}
        >
          <span
            className="absolute inset-0 flex items-center justify-between px-1.5 pointer-events-none"
            style={{ fontSize: 13 }}
          >
            <span>&#9728;</span>
            <span>&#9790;</span>
          </span>
          <span
            className="absolute top-[3px] left-[3px] w-5 h-5 rounded-full"
            style={{
              background: "var(--accent)",
              transform: theme === "dark" ? "translateX(22px)" : "translateX(0)",
              transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
            }}
          />
        </button>
      </div>
    </header>
  );
}
