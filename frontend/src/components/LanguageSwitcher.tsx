import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

const LANGUAGES = [
  { code: "en", label: "English", badge: "EN" },
  { code: "zh", label: "简体中文", badge: "CN" },
] as const;

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const currentLang = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  const handleChange = (code: string) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        className="flex items-center justify-center rounded-lg transition-colors"
        style={{ width: 34, height: 34, color: "var(--muted)", position: "relative" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--sand)";
          e.currentTarget.style.color = "var(--fg)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "none";
          e.currentTarget.style.color = "var(--muted)";
        }}
        title={t("topbar.language")}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <ellipse cx="12" cy="12" rx="4" ry="10" />
          <path d="M2 12h20" />
          <path d="M4.5 7h15M4.5 17h15" />
        </svg>
        <span
          style={{
            position: "absolute",
            bottom: 2,
            right: 0,
            fontSize: 7,
            fontWeight: 700,
            color: "var(--accent)",
            background: "var(--bg)",
            padding: "0 1px",
            borderRadius: 2,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
          }}
        >
          {currentLang.badge}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            minWidth: 160,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            zIndex: 100,
            padding: 4,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -6,
              right: 11,
              width: 12,
              height: 12,
              background: "var(--surface)",
              borderLeft: "1px solid var(--border)",
              borderTop: "1px solid var(--border)",
              transform: "rotate(45deg)",
            }}
          />
          {LANGUAGES.map((lang) => {
            const active = lang.code === i18n.language;
            return (
              <div
                key={lang.code}
                role="menuitem"
                tabIndex={0}
                onClick={() => handleChange(lang.code)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleChange(lang.code); }}
                className="flex items-center gap-2.5 rounded-md cursor-pointer transition-colors"
                style={{
                  padding: "8px 12px",
                  fontSize: 13,
                  fontWeight: active ? 500 : 400,
                  background: active ? "var(--sand)" : "transparent",
                  color: active ? "var(--fg)" : "var(--muted)",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "var(--sand)";
                    e.currentTarget.style.color = "var(--fg)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--muted)";
                  }
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: active ? "var(--accent)" : "inherit",
                    minWidth: 28,
                  }}
                >
                  {lang.badge}
                </span>
                <span>{lang.label}</span>
                {active && (
                  <svg
                    style={{ marginLeft: "auto" }}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
