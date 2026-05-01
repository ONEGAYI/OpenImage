import { useState, useRef, useEffect } from "react";
import { useGenerationStore, RATIO_OPTIONS, SIZE_OPTIONS } from "../stores/generationStore";

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
  const { aspectRatio, imageSize, setAspectRatio, setImageSize } = useGenerationStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

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
      {/* 触发按钮 */}
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
        title="比例和尺寸"
      >
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", height: ICON_BOX_H, flexShrink: 0 }}>
          <span style={{ display: "block", ...ratioIconStyle(aspectRatio, isCustom) }} />
        </span>
        {aspectRatio} · {imageSize}
      </button>

      {/* Popover */}
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
          {/* 居中小三角 */}
          <div
            style={{
              position: "absolute",
              bottom: -6,
              left: "50%",
              marginLeft: -6,
              width: 12,
              height: 12,
              background: "var(--surface)",
              borderRight: "1px solid var(--border)",
              borderBottom: "1px solid var(--border)",
              transform: "rotate(45deg)",
            }}
          />

          {/* 比例区 */}
          <div style={{ marginBottom: 12 }}>
            <div style={sectionLabelStyle}>比例</div>
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

          {/* 分割线 */}
          <div
            style={{
              height: 1,
              background: "var(--border)",
              margin: "0 -14px 12px",
            }}
          />

          {/* 尺寸区 */}
          <div>
            <div style={sectionLabelStyle}>尺寸</div>
            <div style={{ display: "flex", gap: 6 }}>
              {SIZE_OPTIONS.map((tier) => {
                const selected = imageSize === tier;
                return (
                  <button
                    key={tier}
                    onClick={() => setImageSize(tier)}
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
