import { E, U } from "./shared";

// 模型选择器。原先在 Rails 布局里靠 session 存选中值，
// 分离架构下 API 无 cookie session，选中的 id 随建卡请求传给后端。

interface Props {
  models: { id: string; label: string }[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export function ModelPicker({ models, value, onChange, disabled }: Props) {
  if (models.length === 0) return null;

  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 7,
      fontFamily: "'Outfit',sans-serif",
    }}>
      <span style={{ fontSize: 10.5, color: "rgba(255,255,255,.65)" }}>模型</span>
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: "4px 8px", borderRadius: 7, cursor: disabled ? "not-allowed" : "pointer",
          border: "1px solid rgba(255,255,255,.22)",
          background: "rgba(255,255,255,.12)", color: "#fff",
          fontSize: 11, fontFamily: "'Outfit',sans-serif",
          outline: "none", opacity: disabled ? 0.5 : 1,
          transition: `all .16s ${E.smooth}`,
        }}
      >
        {models.map(m => (
          // option 在深色背景下要显式给色，否则部分浏览器下拉是白底白字
          <option key={m.id} value={m.id} style={{ color: U.text, background: "#fff" }}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}
