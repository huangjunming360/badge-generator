import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { U, E } from "./shared";
import { getJson, sendJson } from "../../api/client";

export default function SetupPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getJson<{ needs_setup: boolean }>("/setup").then(d => {
      setNeedsSetup(d.needs_setup);
      setLoading(false);
      if (!d.needs_setup) nav("/", { replace: true });
    }).catch(() => {
      setNeedsSetup(false);
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("密码至少6位"); return; }
    if (password !== confirm) { setError("两次密码不一致"); return; }

    setSaving(true);
    try {
      await sendJson("/setup", "POST", {
        email_address: email, password, password_confirmation: confirm,
      });
      nav("/");
    } catch (err: any) {
      setError(err.errors?.[0] || "创建失败");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: U.bg, padding: 24,
    }}>
      <form onSubmit={handleSubmit} style={{
        width: 400, maxWidth: "100%", background: U.surface,
        borderRadius: 16, padding: 36, boxShadow: "0 4px 24px rgba(0,0,0,.06)",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: U.blue, display: "flex", alignItems: "center",
          justifyContent: "center", marginBottom: 16,
          fontSize: 18, color: "#fff", fontWeight: 700,
        }}>!</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: U.text, marginBottom: 4 }}>初始化系统</h1>
        <p style={{ fontSize: 13, color: U.textLight, marginBottom: 28, lineHeight: 1.5 }}>
          还没有管理员账号。请创建一个初始管理员账号。
        </p>

        {error && (
          <div style={{
            padding: "10px 14px", borderRadius: 10, background: "#FEF2F2",
            color: "#DC2626", fontSize: 13, marginBottom: 16,
          }}>{error}</div>
        )}

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: U.textMid, marginBottom: 5 }}>管理员邮箱</label>
          <input type="email" required autoFocus autoComplete="username" placeholder="admin@yourcompany.com"
            value={email} onChange={e => setEmail(e.target.value)}
            style={inputStyle} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: U.textMid, marginBottom: 5 }}>密码</label>
          <input type="password" required autoComplete="new-password" placeholder="至少6位"
            value={password} onChange={e => setPassword(e.target.value)}
            style={inputStyle} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: U.textMid, marginBottom: 5 }}>确认密码</label>
          <input type="password" required autoComplete="new-password" placeholder="再次输入密码"
            value={confirm} onChange={e => setConfirm(e.target.value)}
            style={inputStyle} />
        </div>

        <button type="submit" disabled={saving} style={{
          width: "100%", padding: "11px 0", borderRadius: 10, border: "none",
          background: saving ? U.textFaint : U.blue, color: "#fff",
          fontSize: 14, fontWeight: 600, cursor: saving ? "default" : "pointer",
          transition: `background .2s ${E.smooth}`,
        }}>{saving ? "创建中…" : "创建管理员"}</button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block", width: "100%", padding: "10px 12px", fontSize: 14,
  border: `1px solid ${U.borderLight}`, borderRadius: 10,
  outline: "none", boxSizing: "border-box",
};
