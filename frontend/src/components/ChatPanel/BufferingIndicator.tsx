import { useTranslation } from "react-i18next";

export default function BufferingIndicator() {
  const { t } = useTranslation();

  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderRadius: "var(--radius-sm)",
          background: "rgba(201,100,66,0.06)",
          border: "1px dashed rgba(201,100,66,0.3)",
        }}
      >
        <div style={{ display: "flex", gap: 3 }}>
          {[0, 0.2, 0.4].map((delay, i) => (
            <div
              key={i}
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--accent)",
                animation: `pulse 1.2s ease-in-out ${delay}s infinite`,
              }}
            />
          ))}
        </div>
        <span style={{ color: "var(--accent)", fontSize: 11, fontWeight: 500 }}>
          {t("llm.buffering")}
        </span>
      </div>
    </div>
  );
}
