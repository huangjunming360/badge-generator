import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { U, E } from "./shared";
import { sendJson } from "../../api/client";

const REGISTER_URL = "/registration";

export default function RegisterPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 6) { setError("密码至少6位"); return; }
    if (password !== confirm) { setError("两次密码输入不一致"); return; }

    setLoading(true);
    try {
      await sendJson(REGISTER_URL, "POST", {
        email_address: email, password, password_confirmation: confirm,
      });
      nav("/");
    } catch (err: any) {
      setError(err.errors?.[0] || "注册失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: U.bg, padding: 24,
    }}>
      <form onSubmit={handleSubmit} style={{
        width: 380, maxWidth: "100%", background: U.surface,
        borderRadius: 16, padding: 36, boxShadow: "0 4px 24px rgba(0,0,0,.06)",
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: U.text, marginBottom: 4 }}>注册</h1>
        <p style={{ fontSize: 13, color: U.textLight, marginBottom: 28, lineHeight: 1.5 }}>
          创建一个账号以使用管理功能
        </p>

        {error && (
          <div style={{
            padding: "10px 14px", borderRadius: 10, background: "#FEF2F2",
            color: "#DC2626", fontSize: 13, marginBottom: 16,
          }}>{error}</div>
        )}

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: U.textMid, marginBottom: 5 }}>邮箱</label>
          <input type="email" required autoComplete="username" placeholder="your@email.com"
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

        <button type="submit" disabled={loading} style={{
          width: "100%", padding: "11px 0", borderRadius: 10, border: "none",
          background: loading ? U.textFaint : U.blue, color: "#fff",
          fontSize: 14, fontWeight: 600, cursor: loading ? "default" : "pointer",
          transition: `background .2s ${E.smooth}`,
        }}>{loading ? "注册中…" : "注册"}</button>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: U.textLight }}>
          已有账号？<Link to="/login" style={{ color: U.blue, textDecoration: "none" }}>登录</Link>
        </div>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block", width: "100%", padding: "10px 12px", fontSize: 14,
  border: `1px solid ${U.borderLight}`, borderRadius: 10,
  outline: "none", boxSizing: "border-box", transition: `border-color .18s ${E.smooth}`,
};
