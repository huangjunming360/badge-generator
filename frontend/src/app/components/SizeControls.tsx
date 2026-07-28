import { useState } from "react";
import { E, U } from "./shared";

// 实物尺寸与预览缩放控件。原先在 Rails 的 ERB 局部视图里，
// 前后端分离后搬到这里，边界值由后端 schema 提供而非写死。

interface Props {
  widthMm: number;
  heightMm: number;
  minMm: number;
  maxMm: number;
  defaultWidthMm: number;
  defaultHeightMm: number;
  previewScale: number;
  scales: number[];
  saveState: "idle" | "saving" | "saved" | "error";
  onCommitSize: (widthMm: number, heightMm: number) => void;
  onPreviewScale: (scale: number) => void;
}

const inputStyle: React.CSSProperties = {
  width: 72, padding: "6px 10px", borderRadius: 8,
  border: `1px solid ${U.border}`, background: U.surface,
  fontSize: 12.5, color: U.text, fontFamily: "'Outfit',sans-serif",
  outline: "none",
};

export function SizeControls({
  widthMm, heightMm, minMm, maxMm, defaultWidthMm, defaultHeightMm,
  previewScale, scales, saveState, onCommitSize, onPreviewScale,
}: Props) {
  // 输入框保留字符串本地态：用户清空或中途输入时不该立刻改预览。
  const [draft, setDraft] = useState({ w: String(widthMm), h: String(heightMm) });
  const [touched, setTouched] = useState(false);

  const wNum = parseInt(draft.w, 10);
  const hNum = parseInt(draft.h, 10);
  const valid = (n: number) => Number.isInteger(n) && n >= minMm && n <= maxMm;
  const bothValid = valid(wNum) && valid(hNum);

  // 失焦或按回车才提交，避免每敲一个字符打一次请求。
  const commit = () => {
    if (!bothValid) return;
    onCommitSize(wNum, hNum);
    setTouched(false);
  };

  const reset = () => {
    setDraft({ w: String(defaultWidthMm), h: String(defaultHeightMm) });
    onCommitSize(defaultWidthMm, defaultHeightMm);
    setTouched(false);
  };

  const hint = () => {
    if (touched && !bothValid) return { text: `请输入 ${minMm}–${maxMm} 之间的整数`, color: "#C05060" };
    if (saveState === "saving") return { text: "保存中…", color: U.textMid };
    if (saveState === "saved") return { text: "已保存", color: U.green };
    if (saveState === "error") return { text: "保存失败", color: "#C05060" };
    return { text: `默认 ${defaultWidthMm} × ${defaultHeightMm}mm`, color: U.textLight };
  };

  const h = hint();

  return (
    <div style={{
      display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap",
      fontFamily: "'Outfit',sans-serif",
    }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 10.5, color: U.textMid }}>宽 (mm)</span>
        <input
          type="number" inputMode="numeric" value={draft.w}
          min={minMm} max={maxMm} step={1} style={inputStyle}
          onChange={e => { setDraft(d => ({ ...d, w: e.target.value })); setTouched(true); }}
          onBlur={commit}
          onKeyDown={e => e.key === "Enter" && commit()}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 10.5, color: U.textMid }}>高 (mm)</span>
        <input
          type="number" inputMode="numeric" value={draft.h}
          min={minMm} max={maxMm} step={1} style={inputStyle}
          onChange={e => { setDraft(d => ({ ...d, h: e.target.value })); setTouched(true); }}
          onBlur={commit}
          onKeyDown={e => e.key === "Enter" && commit()}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 10.5, color: U.textMid }}>预览缩放</span>
        <select
          value={previewScale} style={{ ...inputStyle, width: 84, cursor: "pointer" }}
          onChange={e => onPreviewScale(parseFloat(e.target.value))}
        >
          {scales.map(s => (
            <option key={s} value={s}>{String(s).replace(/\.0$/, "")}×</option>
          ))}
        </select>
      </label>

      <button
        onClick={reset}
        style={{
          padding: "7px 12px", borderRadius: 8, cursor: "pointer",
          border: `1px solid ${U.border}`, background: U.surface,
          fontSize: 11.5, color: U.textMid, fontFamily: "'Outfit',sans-serif",
          transition: `all .18s ${E.smooth}`,
        }}
      >
        恢复默认
      </button>

      <span style={{ fontSize: 10.5, color: h.color, paddingBottom: 7 }}>{h.text}</span>
    </div>
  );
}
