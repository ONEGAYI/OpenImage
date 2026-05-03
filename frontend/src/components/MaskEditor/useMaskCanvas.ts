import { useRef, useState, useCallback, useEffect } from "react";

export type Tool = "brush" | "rectangle" | "eraser";

interface Point {
  x: number;
  y: number;
}

interface Rect {
  start: Point;
  end: Point;
}

interface MaskCanvasState {
  tool: Tool;
  brushSize: number;
  zoom: number;
  panOffset: Point;
  isDrawing: boolean;
  hasMask: boolean;
}

export function useMaskCanvas(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  imageElement: HTMLImageElement | null
) {
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [state, setState] = useState<MaskCanvasState>({
    tool: "brush",
    brushSize: 32,
    zoom: 1,
    panOffset: { x: 0, y: 0 },
    isDrawing: false,
    hasMask: false,
  });

  // Ref 镜像：高频变值通过 ref 读取，避免 callback 依赖更新
  const stateRef = useRef(state);

  const currentPathRef = useRef<Point[]>([]);
  const currentRectRef = useRef<Rect | null>(null);
  const displayScaleRef = useRef(1);
  const lastPanPointRef = useRef<Point | null>(null);

  const updateState = useCallback(
    (updater: (prev: MaskCanvasState) => Partial<MaskCanvasState>) => {
      setState((prev) => {
        const next = { ...prev, ...updater(prev) };
        stateRef.current = next;
        return next;
      });
    },
    [],
  );

  const getImageRect = useCallback(() => {
    if (!imageElement || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    const { zoom, panOffset } = stateRef.current;
    const imgW = imageElement.naturalWidth;
    const imgH = imageElement.naturalHeight;
    const canvasW = canvas.width;
    const canvasH = canvas.height;
    const scale = Math.min(canvasW / imgW, canvasH / imgH) * zoom;
    displayScaleRef.current = scale;
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const offsetX = (canvasW - drawW) / 2 + panOffset.x;
    const offsetY = (canvasH - drawH) / 2 + panOffset.y;
    return { x: offsetX, y: offsetY, w: drawW, h: drawH, scale };
  }, [imageElement]);

  const ensureMaskCanvas = useCallback(() => {
    if (!imageElement) return null;
    if (
      !maskCanvasRef.current ||
      maskCanvasRef.current.width !== imageElement.naturalWidth ||
      maskCanvasRef.current.height !== imageElement.naturalHeight
    ) {
      const c = document.createElement("canvas");
      c.width = imageElement.naturalWidth;
      c.height = imageElement.naturalHeight;
      maskCanvasRef.current = c;
    }
    return maskCanvasRef.current;
  }, [imageElement]);

  const canvasToImage = useCallback(
    (cx: number, cy: number): Point | null => {
      const rect = getImageRect();
      if (!rect) return null;
      const dpr = window.devicePixelRatio || 1;
      return {
        x: (cx * dpr - rect.x) / rect.scale,
        y: (cy * dpr - rect.y) / rect.scale,
      };
    },
    [getImageRect]
  );

  const drawMaskDot = useCallback(
    (ctx: CanvasRenderingContext2D, imgPoint: Point, erase: boolean) => {
      const size = stateRef.current.brushSize / displayScaleRef.current;
      ctx.beginPath();
      ctx.arc(imgPoint.x, imgPoint.y, size / 2, 0, Math.PI * 2);
      if (erase) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(205,120,92,1)";
      }
      ctx.fill();
    },
    [],
  );

  const drawMaskLine = useCallback(
    (ctx: CanvasRenderingContext2D, from: Point, to: Point, erase: boolean) => {
      const size = stateRef.current.brushSize / displayScaleRef.current;
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const step = Math.max(1, size / 4);
      const steps = Math.max(1, Math.ceil(dist / step));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        drawMaskDot(ctx, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, erase);
      }
    },
    [drawMaskDot],
  );

  const renderOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageElement) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = getImageRect();
    if (!rect) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageElement, rect.x, rect.y, rect.w, rect.h);

    const maskC = maskCanvasRef.current;
    if (maskC) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.drawImage(maskC, rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }

    if (currentRectRef.current) {
      const r = currentRectRef.current;
      const sx = r.start.x * rect.scale + rect.x;
      const sy = r.start.y * rect.scale + rect.y;
      const ex = r.end.x * rect.scale + rect.x;
      const ey = r.end.y * rect.scale + rect.y;
      ctx.fillStyle = "rgba(205,120,92,0.35)";
      ctx.fillRect(
        Math.min(sx, ex),
        Math.min(sy, ey),
        Math.abs(ex - sx),
        Math.abs(ey - sy),
      );
    }
  }, [imageElement, getImageRect]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!imageElement) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const cx = e.clientX - bounds.left;
      const cy = e.clientY - bounds.top;

      if (e.button === 1) {
        lastPanPointRef.current = { x: e.clientX, y: e.clientY };
        return;
      }

      const imgPoint = canvasToImage(cx, cy);
      if (!imgPoint) return;

      const maskC = ensureMaskCanvas();
      if (!maskC) return;
      const ctx = maskC.getContext("2d");
      if (!ctx) return;

      const { tool } = stateRef.current;
      updateState(() => ({ isDrawing: true }));

      if (tool === "rectangle") {
        currentRectRef.current = { start: imgPoint, end: imgPoint };
      } else {
        const erase = tool === "eraser";
        drawMaskDot(ctx, imgPoint, erase);
        currentPathRef.current = [imgPoint];
        updateState(() => ({ hasMask: true }));
      }
      renderOverlay();
    },
    [imageElement, canvasToImage, ensureMaskCanvas, drawMaskDot, renderOverlay, updateState],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (lastPanPointRef.current) {
        const dx = e.clientX - lastPanPointRef.current.x;
        const dy = e.clientY - lastPanPointRef.current.y;
        lastPanPointRef.current = { x: e.clientX, y: e.clientY };
        updateState((s) => ({
          panOffset: { x: s.panOffset.x + dx, y: s.panOffset.y + dy },
        }));
        return;
      }

      const { isDrawing, tool } = stateRef.current;
      if (!isDrawing || !imageElement) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const cx = e.clientX - bounds.left;
      const cy = e.clientY - bounds.top;
      const imgPoint = canvasToImage(cx, cy);
      if (!imgPoint) return;

      if (tool === "rectangle") {
        currentRectRef.current = { ...currentRectRef.current!, end: imgPoint };
      } else {
        const maskC = ensureMaskCanvas();
        if (!maskC) return;
        const ctx = maskC.getContext("2d");
        if (!ctx) return;
        const last = currentPathRef.current[currentPathRef.current.length - 1];
        if (last) {
          const erase = tool === "eraser";
          drawMaskLine(ctx, last, imgPoint, erase);
        }
        currentPathRef.current.push(imgPoint);
      }
      renderOverlay();
    },
    [imageElement, canvasToImage, ensureMaskCanvas, drawMaskLine, renderOverlay, updateState],
  );

  const handleMouseUp = useCallback(() => {
    if (lastPanPointRef.current) {
      lastPanPointRef.current = null;
      return;
    }

    const { tool } = stateRef.current;
    if (tool === "rectangle" && currentRectRef.current) {
      const maskC = ensureMaskCanvas();
      if (maskC) {
        const ctx = maskC.getContext("2d");
        if (ctx) {
          const r = currentRectRef.current;
          ctx.fillStyle = "rgba(205,120,92,1)";
          ctx.globalCompositeOperation = "source-over";
          const x = Math.min(r.start.x, r.end.x);
          const y = Math.min(r.start.y, r.end.y);
          const w = Math.abs(r.end.x - r.start.x);
          const h = Math.abs(r.end.y - r.start.y);
          ctx.fillRect(x, y, w, h);
          updateState(() => ({ hasMask: true }));
        }
      }
      currentRectRef.current = null;
    }

    updateState(() => ({ isDrawing: false }));
    renderOverlay();
  }, [ensureMaskCanvas, renderOverlay, updateState]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      updateState((s) => ({
        zoom: Math.max(0.25, Math.min(5, s.zoom * delta)),
      }));
    },
    [updateState],
  );

  const exportMask = useCallback((): string | null => {
    const maskC = maskCanvasRef.current;
    if (!maskC || !stateRef.current.hasMask) return null;

    const output = document.createElement("canvas");
    output.width = maskC.width;
    output.height = maskC.height;
    const ctx = output.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskC, 0, 0);

    const dataUrl = output.toDataURL("image/png");
    return dataUrl.split(",")[1];
  }, []);

  const clearMask = useCallback(() => {
    const maskC = ensureMaskCanvas();
    if (maskC) {
      const ctx = maskC.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, maskC.width, maskC.height);
    }
    currentRectRef.current = null;
    updateState(() => ({ hasMask: false }));
    renderOverlay();
  }, [ensureMaskCanvas, renderOverlay, updateState]);

  useEffect(() => {
    renderOverlay();
  }, [state.zoom, state.panOffset, renderOverlay]);

  return {
    state,
    setTool: (tool: Tool) => updateState(() => ({ tool })),
    setBrushSize: (size: number) => updateState(() => ({ brushSize: size })),
    resetZoom: () => updateState(() => ({ zoom: 1, panOffset: { x: 0, y: 0 } })),
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    exportMask,
    clearMask,
    renderOverlay,
  };
}
