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

  const currentPathRef = useRef<Point[]>([]);
  const currentRectRef = useRef<Rect | null>(null);
  const displayScaleRef = useRef(1);
  const lastPanPointRef = useRef<Point | null>(null);

  // 计算原图在 Canvas 中的显示区域（object-fit: contain）
  const getImageRect = useCallback(() => {
    if (!imageElement || !canvasRef.current) return null;
    const canvas = canvasRef.current;
    const imgW = imageElement.naturalWidth;
    const imgH = imageElement.naturalHeight;
    const canvasW = canvas.width;
    const canvasH = canvas.height;
    const scale = Math.min(canvasW / imgW, canvasH / imgH) * state.zoom;
    displayScaleRef.current = scale;
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const offsetX = (canvasW - drawW) / 2 + state.panOffset.x;
    const offsetY = (canvasH - drawH) / 2 + state.panOffset.y;
    return { x: offsetX, y: offsetY, w: drawW, h: drawH, scale };
  }, [imageElement, state.zoom, state.panOffset]);

  // 初始化离屏 mask canvas（与原图同尺寸）
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

  // 将 canvas 坐标转换为原图坐标
  const canvasToImage = useCallback(
    (cx: number, cy: number): Point | null => {
      const rect = getImageRect();
      if (!rect) return null;
      return {
        x: (cx - rect.x) / rect.scale,
        y: (cy - rect.y) / rect.scale,
      };
    },
    [getImageRect]
  );

  // 在 mask canvas 上绘制一个笔触点
  const drawMaskDot = useCallback(
    (ctx: CanvasRenderingContext2D, imgPoint: Point, erase: boolean) => {
      const size = state.brushSize / displayScaleRef.current;
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
    [state.brushSize]
  );

  // 在 mask canvas 上绘制一条线段（两个点之间插值）
  const drawMaskLine = useCallback(
    (ctx: CanvasRenderingContext2D, from: Point, to: Point, erase: boolean) => {
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      const step = Math.max(1, state.brushSize / displayScaleRef.current / 4);
      const steps = Math.max(1, Math.ceil(dist / step));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        drawMaskDot(ctx, { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }, erase);
      }
    },
    [drawMaskDot, state.brushSize]
  );

  // 渲染蒙版叠加到显示 canvas
  const renderOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const maskC = maskCanvasRef.current;
    if (!canvas || !imageElement || !maskC) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = getImageRect();
    if (!rect) return;

    // 清空并绘制原图
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageElement, rect.x, rect.y, rect.w, rect.h);

    // 绘制蒙版叠加（半透明）
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.drawImage(maskC, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();

    // 绘制矩形预览
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
        Math.abs(ey - sy)
      );
    }
  }, [canvasRef, imageElement, getImageRect]);

  // 鼠标事件处理
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!imageElement) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const cx = e.clientX - bounds.left;
      const cy = e.clientY - bounds.top;

      // 中键拖拽平移
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

      setState((s) => ({ ...s, isDrawing: true }));

      if (state.tool === "rectangle") {
        currentRectRef.current = { start: imgPoint, end: imgPoint };
      } else {
        const erase = state.tool === "eraser";
        drawMaskDot(ctx, imgPoint, erase);
        currentPathRef.current = [imgPoint];
        setState((s) => ({ ...s, hasMask: true }));
      }
      renderOverlay();
    },
    [canvasRef, imageElement, state.tool, canvasToImage, ensureMaskCanvas, drawMaskDot, renderOverlay]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // 平移
      if (lastPanPointRef.current) {
        const dx = e.clientX - lastPanPointRef.current.x;
        const dy = e.clientY - lastPanPointRef.current.y;
        lastPanPointRef.current = { x: e.clientX, y: e.clientY };
        setState((s) => ({
          ...s,
          panOffset: { x: s.panOffset.x + dx, y: s.panOffset.y + dy },
        }));
        return;
      }

      if (!state.isDrawing || !imageElement) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const cx = e.clientX - bounds.left;
      const cy = e.clientY - bounds.top;
      const imgPoint = canvasToImage(cx, cy);
      if (!imgPoint) return;

      if (state.tool === "rectangle") {
        currentRectRef.current = { ...currentRectRef.current!, end: imgPoint };
      } else {
        const maskC = ensureMaskCanvas();
        if (!maskC) return;
        const ctx = maskC.getContext("2d");
        if (!ctx) return;
        const last = currentPathRef.current[currentPathRef.current.length - 1];
        if (last) {
          const erase = state.tool === "eraser";
          drawMaskLine(ctx, last, imgPoint, erase);
        }
        currentPathRef.current.push(imgPoint);
      }
      renderOverlay();
    },
    [state.isDrawing, state.tool, imageElement, canvasRef, canvasToImage, ensureMaskCanvas, drawMaskLine, renderOverlay]
  );

  const handleMouseUp = useCallback(() => {
    if (lastPanPointRef.current) {
      lastPanPointRef.current = null;
      return;
    }

    if (state.tool === "rectangle" && currentRectRef.current) {
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
          setState((s) => ({ ...s, hasMask: true }));
        }
      }
      currentRectRef.current = null;
    }

    setState((s) => ({ ...s, isDrawing: false }));
    renderOverlay();
  }, [state.tool, ensureMaskCanvas, renderOverlay]);

  // 滚轮缩放
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setState((s) => ({
        ...s,
        zoom: Math.max(0.25, Math.min(5, s.zoom * delta)),
      }));
    },
    []
  );

  // 导出蒙版为透明 PNG base64
  const exportMask = useCallback((): string | null => {
    const maskC = maskCanvasRef.current;
    if (!maskC || !state.hasMask) return null;

    const output = document.createElement("canvas");
    output.width = maskC.width;
    output.height = maskC.height;
    const ctx = output.getContext("2d")!;

    const maskCtx = maskC.getContext("2d")!;
    const imgData = maskCtx.getImageData(0, 0, maskC.width, maskC.height);

    // 有绘制内容的区域为白色不透明，未绘制区域为透明
    const outData = ctx.createImageData(maskC.width, maskC.height);
    for (let i = 0; i < imgData.data.length; i += 4) {
      const alpha = imgData.data[i + 3];
      outData.data[i] = 255;
      outData.data[i + 1] = 255;
      outData.data[i + 2] = 255;
      outData.data[i + 3] = alpha;
    }
    ctx.putImageData(outData, 0, 0);

    const dataUrl = output.toDataURL("image/png");
    return dataUrl.split(",")[1];
  }, [state.hasMask]);

  // 重置蒙版
  const clearMask = useCallback(() => {
    const maskC = ensureMaskCanvas();
    if (maskC) {
      const ctx = maskC.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, maskC.width, maskC.height);
    }
    currentRectRef.current = null;
    setState((s) => ({ ...s, hasMask: false }));
    renderOverlay();
  }, [ensureMaskCanvas, renderOverlay]);

  // zoom/pan 变化时重新渲染
  useEffect(() => {
    renderOverlay();
  }, [state.zoom, state.panOffset, renderOverlay]);

  return {
    state,
    setTool: (tool: Tool) => setState((s) => ({ ...s, tool })),
    setBrushSize: (size: number) => setState((s) => ({ ...s, brushSize: size })),
    resetZoom: () => setState((s) => ({ ...s, zoom: 1, panOffset: { x: 0, y: 0 } })),
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    exportMask,
    clearMask,
    renderOverlay,
  };
}
