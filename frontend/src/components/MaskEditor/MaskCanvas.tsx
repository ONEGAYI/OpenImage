import { useEffect, useRef } from "react";
import { useMaskCanvas } from "./useMaskCanvas";

interface MaskCanvasProps {
  maskCanvasHook: ReturnType<typeof useMaskCanvas>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export default function MaskCanvas({ maskCanvasHook, canvasRef }: MaskCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hookRef = useRef(maskCanvasHook);
  hookRef.current = maskCanvasHook;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver(() => {
      const { width, height } = container.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
      hookRef.current.renderOverlay();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [canvasRef]);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, position: "relative", overflow: "hidden", cursor: "crosshair" }}
    >
      <canvas
        ref={canvasRef as React.Ref<HTMLCanvasElement>}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
        onMouseDown={maskCanvasHook.handleMouseDown}
        onMouseMove={maskCanvasHook.handleMouseMove}
        onMouseUp={maskCanvasHook.handleMouseUp}
        onMouseLeave={maskCanvasHook.handleMouseUp}
        onWheel={maskCanvasHook.handleWheel}
      />
    </div>
  );
}
