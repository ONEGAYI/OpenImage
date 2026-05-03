import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useGenerationStore, RATIO_OPTIONS, SIZE_OPTIONS } from "../stores/generationStore";
import PopoverArrow from "./PopoverArrow";
import { useClickOutside } from "../hooks/useClickOutside";

const RATIO_ICONS: Record<string, { w: number; h: number }> = {
  "1:1": { w: 20, h: 20 },
  "16:9": { w: 26, h: 15 },
  "9:16": { w: 15, h: 26 },
};

const ICON_BOX_H = 28;

function ratioIconStyle(ratio: string, active: boolean) {
  const { w, h } = RATIO_ICONS[ratio];
  return {
    width: w,
    height: h,
    border: `1.5px solid ${active ? "white" : "var(--silver)"}`,
    borderRadius: ratio === "1:1" ? 3 : 2,
  };
}

const iconAreaStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: ICON_BOX_H + 10,
  width: "100%",
};

function labelStyle(selected: boolean): React.CSSProperties {
  return {
    width: "100%",
    textAlign: "center",
    padding: "4px 0",
    background: selected ? "rgba(0,0,0,0.15)" : "var(--sand)",
    color: selected ? "white" : "var(--muted)",
    fontSize: 11,
    fontWeight: 500,
  };
}

export default function RatioSelector() {
  const { t } = useTranslation();
  const { aspectRatio, imageSize, setAspectRatio, setImageSize } = useGenerationStore();
  const [open, setOpen] = useState(false);
  const closePopover = useCallback(() => setOpen(false), []);
  const containerRef = useClickOutside(open, closePopover);

  const isCustom = aspectRatio !== "1:1" || imageSize !== "1K";

  const buttonBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 10px",
    fontSize: 12,
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s",
  };

  const optionBtn = (selected: boolean): React.CSSProperties => ({
    flex: 1,
    padding: 0,
    borderRadius: "var(--radius-sm)",
    border: selected ? "none" : "1px solid var(--border)",
    background: selected ? "var(--accent)" : "none",
    fontSize: 12,
    color: selected ? "white" : "var(--muted)",
    fontWeight: selected ? 500 : 400,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    overflow: "hidden",
    boxShadow: selected ? "0 1px 4px rgba(201,100,66,0.2)" : "none",
  });

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--faint)",
    marginBottom: 8,
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          ...buttonBase,
          color: isCustom ? "white" : "var(--muted)",
          background: isCustom ? "var(--accent)" : "none",
          border: "1px solid " + (isCustom ? "transparent" : "var(--border)"),
        }}
        onMouseEnter={(e) => {
          if (!isCustom) {
            e.currentTarget.style.background = "var(--sand)";
            e.currentTarget.style.color = "var(--fg)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isCustom) {
            e.currentTarget.style.background = "none";
            e.currentTarget.style.color = "var(--muted)";
          }
        }}
        title={t("ratio.tooltip")}
      >
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: ICON_BOX_H, flexShrink: 0 }}>
          <span style={{ display: "block", ...ratioIconStyle(aspectRatio, isCustom) }} />
        </span>
        {aspectRatio} · {imageSize}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 10px)",
            left: "50%",
            transform: "translateX(-50%)",
            width: 240,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
            padding: 14,
            zIndex: 50,
          }}
        >
<PopoverArrow position="bottom" />

          <div style={{ marginBottom: 12 }}>
            <div style={sectionLabelStyle}>{t("ratio.ratio")}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {RATIO_OPTIONS.map((ratio) => {
                const selected = aspectRatio === ratio;
                return (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    style={optionBtn(selected)}
                  >
                    <div style={iconAreaStyle}>
                      <div style={ratioIconStyle(ratio, selected)} />
                    </div>
                    <div style={labelStyle(selected)}>
                      {ratio}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              height: 1,
              background: "var(--border)",
              margin: "0 -14px 12px",
            }}
          />

          <div>
            <div style={sectionLabelStyle}>{t("ratio.size")}</div>
            <div style={{ display: "flex", gap: 6 }}>
              {SIZE_OPTIONS.map((tier) => {
                const selected = imageSize === tier;
                return (
                  <button
                    key={tier}
                    onClick={() => setImageSize(tier)}
                    title={tier !== "1K" ? t("ratio.sizeWarning") : undefined}
                    style={{
                      ...optionBtn(selected),
                      flexDirection: "row",
                      justifyContent: "center",
                      padding: "8px 0",
                    }}
                  >
                    {tier}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
