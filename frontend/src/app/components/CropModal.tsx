import { useEffect, useRef, useState } from "react";
import { U } from "./shared";

interface Props {
  src: string;
  open: boolean;
  onClose: () => void;
  onCrop: (blob: Blob) => void;
  aspectRatio?: number;
}

export default function CropModal({ src, open, onClose, onCrop, aspectRatio = 3 / 4 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 200, h: 266 });
  const [drag, setDrag] = useState<string | null>(null);
  const dragStart = useRef({ mx: 0, my: 0, cx: 0, cy: 0, cw: 0, ch: 0 });

  useEffect(() => {
    if (!open) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      const maxW = Math.min(img.width, window.innerWidth * 0.7);
      const maxH = Math.min(img.height, window.innerHeight * 0.55);
      const s = Math.min(maxW / img.width, maxH / img.height);
      const dw = img.width * s, dh = img.height * s;
      setImgSize({ w: dw, h: dh });
      const cw = dw * 0.6;
      setCrop({ x: (dw - cw) / 2, y: (dh - cw / aspectRatio) / 2, w: cw, h: cw / aspectRatio });
    };
    img.src = src;
  }, [open, src]);

  useEffect(() => {
    const c = canvasRef.current, img = imgRef.current;
    if (!c || !img || !imgSize.w) return;
    const ctx = c.getContext("2d")!, dpr = devicePixelRatio || 1;
    c.width = imgSize.w * dpr; c.height = imgSize.h * dpr;
    c.style.width = imgSize.w + "px"; c.style.height = imgSize.h + "px";
    ctx.scale(dpr, dpr);
    ctx.drawImage(img, 0, 0, imgSize.w, imgSize.h);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, imgSize.w, imgSize.h);
    ctx.save();
    ctx.clearRect(crop.x, crop.y, crop.w, crop.h);
    ctx.drawImage(img, crop.x / imgSize.w * img.width, crop.y / imgSize.h * img.height,
      crop.w / imgSize.w * img.width, crop.h / imgSize.h * img.height,
      crop.x, crop.y, crop.w, crop.h);
    ctx.restore();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5;
    ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
  }, [crop, imgSize]);

  const detectMode = (e: React.MouseEvent): string | null => {
    const r = canvasRef.current; if (!r) return null;
    const rect = r.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const S = 15;
    const T = (x: number, y: number) => crop.x + x * crop.w - S < mx && mx < crop.x + x * crop.w + S && crop.y + y * crop.h - S < my && my < crop.y + y * crop.h + S;
    if (T(0,0)) return "tl"; if (T(1,0)) return "tr";
    if (T(0,1)) return "bl"; if (T(1,1)) return "br";
    if (mx > crop.x && mx < crop.x + crop.w && my > crop.y && my < crop.y + crop.h) return "move";
    return null;
  };

  const start = (e: React.MouseEvent) => { const t = detectMode(e); setDrag(t); if (!t) return;
    dragStart.current = { mx: e.clientX, my: e.clientY, cx: crop.x, cy: crop.y, cw: crop.w, ch: crop.h }; };
  const move = (e: React.MouseEvent) => {
    if (!drag) { setDrag(detectMode(e)); return; }
    const dx = e.clientX - dragStart.current.mx, dy = e.clientY - dragStart.current.my;
    const s = dragStart.current;
    let x = s.cx, y = s.cy, w = s.cw, h = s.ch;
    if (drag === "tl") { x = s.cx + dx; y = s.cy + dy; w = s.cw - dx; h = s.ch - dy; }
    else if (drag === "tr") { y = s.cy + dy; w = s.cw + dx; h = s.ch - dy; }
    else if (drag === "bl") { x = s.cx + dx; w = s.cw - dx; h = s.ch + dy; }
    else if (drag === "br") { w = s.cw + dx; h = s.ch + dy; }
    else if (drag === "move") { x = s.cx + dx; y = s.cy + dy; }
    w = Math.max(40, Math.min(w, imgSize.w - x));
    h = Math.max(40, Math.min(h, imgSize.h - y));
    x = Math.max(0, Math.min(x, imgSize.w - w));
    y = Math.max(0, Math.min(y, imgSize.h - h));
    setCrop({ x, y, w, h: Math.min(h, w / aspectRatio) });
  };

  const doCrop = () => {
    const img = imgRef.current; if (!img) return;
    const c = document.createElement("canvas");
    c.width = Math.round(crop.w / imgSize.w * img.width);
    c.height = Math.round(crop.h / imgSize.h * img.height);
    c.getContext("2d")!.drawImage(img, crop.x / imgSize.w * img.width, crop.y / imgSize.h * img.height,
      c.width, c.height, 0, 0, c.width, c.height);
    c.toBlob(b => b && onCrop(b), "image/jpeg", 0.92);
  };

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid " + U.borderLight, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
          <span>裁切</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: U.textFaint }}>x</button>
        </div>
        <canvas ref={canvasRef} style={{ cursor: drag ? "grabbing" : "grab", display: "block" }}
          onMouseDown={start} onMouseMove={move} onMouseUp={() => setDrag(null)} onMouseLeave={() => setDrag(null)} />
        <div style={{ padding: "12px 16px", borderTop: "1px solid " + U.borderLight, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid " + U.border, background: "#fff", cursor: "pointer", fontSize: 12, color: U.textMid }}>取消</button>
          <button onClick={doCrop} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: U.blue, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>确认裁切</button>
        </div>
      </div>
    </div>
  );
}
