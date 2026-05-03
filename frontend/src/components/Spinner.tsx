interface SpinnerProps {
  size?: number;
  borderWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function Spinner({ size = 32, borderWidth = 3, className, style }: SpinnerProps) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        border: `${borderWidth}px solid var(--border)`,
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "spin 1s linear infinite",
        ...style,
      }}
    />
  );
}
