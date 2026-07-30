import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { U } from "./shared";

interface Props {
  src: string;
  open: boolean;
  onClose: () => void;
  onCrop: (blob: Blob, fullScreen?: boolean) => void;
}

const RATIOS: { label: string; value: number }[] = [
  { label: "原始", value: -1 },
  { label: "1:1", value: 1 },
  { label: "3:4", value: 3 / 4 },
  { label: "4:3", value: 4 / 3 },
  { label: "9:16", value: 9 / 16 },
];

export default function CropModal({ src, open, onClose, onCrop }: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [ratio, setRatio] = useState<number>(3 / 4);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropComplete = useCallback((_: Area, cropped: Area) => {
    setCroppedAreaPixels(cropped);
  }, []);

  const doCrop = async () => {
    const fullScreen = ratio < 0;
    // 全屏模式：返回完整图片
    if (fullScreen) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;
      await new Promise<void>(r => { img.onload = () => r(); });
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      c.getContext("2d")!.drawImage(img, 0, 0);
      c.toBlob(b => b && onCrop(b, true), "image/jpeg", 0.92);
      return;
    }
    if (!croppedAreaPixels) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    await new Promise<void>(r => { img.onload = () => r(); });
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    c.width = croppedAreaPixels.width;
    c.height = croppedAreaPixels.height;
    ctx.drawImage(img, croppedAreaPixels.x, croppedAreaPixels.y,
      croppedAreaPixels.width, croppedAreaPixels.height, 0, 0, c.width, c.height);
    c.toBlob(b => b && onCrop(b), "image/jpeg", 0.92);
  };

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.75)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}>
      <div style={{ background: "#222", borderRadius: 14, overflow: "hidden", width: "90vw", maxWidth: 520, maxHeight: "90vh", display: "flex", flexDirection: "column" }}
        onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "#fff", fontSize: 13, fontWeight: 600 }}>
          <span>裁切</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: 18 }}>×</button>
        </div>

        {/* Crop area */}
        <div style={{ position: "relative", width: "100%", height: 340, background: "#111" }}>
          {ratio >= 0 ? (
            <Cropper image={src} crop={crop} zoom={zoom} aspect={ratio}
              onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onCropComplete}
              cropShape="rect" showGrid />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <img src={src} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} alt="" />
            </div>
          )}
        </div>

        {/* Controls */}
        <div style={{ padding: "8px 12px", borderTop: "1px solid #333", display: "flex", alignItems: "center", gap: 6 }}>
          {/* Ratios */}
          {RATIOS.map(r => (
            <button key={r.label} onClick={() => setRatio(r.value)} style={{
              padding: "4px 8px", borderRadius: 6, border: ratio === r.value ? "1px solid #fff" : "1px solid transparent",
              background: ratio === r.value ? "rgba(255,255,255,.12)" : "transparent",
              color: ratio === r.value ? "#fff" : "#999", cursor: "pointer", fontSize: 10,
            }}>{r.label}</button>
          ))}
          <div style={{ flex: 1 }} />
          {ratio >= 0 && <>
            <span style={{ color: "#999", fontSize: 10, marginRight: 4 }}>{Math.round(zoom * 100)}%</span>
            <input type="range" min={1} max={3} step={0.05} value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))}
            style={{ width: 80, accentColor: "#fff" }} /></>}
        </div>

        {/* Actions */}
        <div style={{ padding: "10px 16px", borderTop: "1px solid #333", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "7px 16px", borderRadius: 8, border: "1px solid #444", background: "transparent", cursor: "pointer", fontSize: 12, color: "#999" }}>取消</button>
          <button onClick={doCrop} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: U.blue, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>确认</button>
        </div>
      </div>
    </div>
  );
}
