interface PopoverArrowProps {
  position: "top" | "bottom";
  align?: "center" | "right";
  offsetRight?: number;
}

export default function PopoverArrow({ position, align = "center", offsetRight }: PopoverArrowProps) {
  const isTop = position === "top";
  const borderProp = isTop ? "borderRight" : "borderLeft";
  const borderProp2 = isTop ? "borderBottom" : "borderTop";
  const rotation = isTop ? 45 : 225;

  const style: React.CSSProperties = {
    position: "absolute",
    ...(isTop ? { bottom: -6 } : { top: -6 }),
    ...(align === "center"
      ? { left: "50%", marginLeft: -6 }
      : { right: offsetRight ?? 11 }),
    width: 12,
    height: 12,
    background: "var(--surface)",
    [borderProp]: "1px solid var(--border)",
    [borderProp2]: "1px solid var(--border)",
    transform: `rotate(${rotation}deg)`,
  };

  return <div style={style} />;
}
