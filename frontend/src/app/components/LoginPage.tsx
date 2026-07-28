import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { U, E } from "./shared";
import { login } from "../../api/sessions";

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      nav("/");
    } catch (err: any) {
      setError(err.errors?.[0] || "登录失败");
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
        <h1 style={{ fontSize: 22, fontWeight: 700, color: U.text, marginBottom: 4 }}>登录</h1>
        <p style={{ fontSize: 13, color: U.textLight, marginBottom: 28, lineHeight: 1.5 }}>
          使用账号登录以使用管理功能
        </p>

        {error && (
          <div style={{
            padding: "10px 14px", borderRadius: 10, background: "#FEF2F2",
            color: "#DC2626", fontSize: 13, marginBottom: 16,
          }}>{error}</div>
        )}

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: U.textMid, marginBottom: 5 }}>邮箱</label>
          <input type="email" required autoFocus autoComplete="username" placeholder="your@email.com"
            value={email} onChange={e => setEmail(e.target.value)}
            style={inputStyle} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: U.textMid, marginBottom: 5 }}>密码</label>
          <input type="password" required autoComplete="current-password" placeholder="输入密码"
            value={password} onChange={e => setPassword(e.target.value)}
            style={inputStyle} />
        </div>

        <button type="submit" disabled={loading} style={{
          width: "100%", padding: "11px 0", borderRadius: 10, border: "none",
          background: loading ? U.textFaint : U.blue, color: "#fff",
          fontSize: 14, fontWeight: 600, cursor: loading ? "default" : "pointer",
          transition: `background .2s ${E.smooth}`,
        }}>{loading ? "登录中…" : "登录"}</button>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontSize: 13 }}>
          <Link to="/register" style={{ color: U.blue, textDecoration: "none" }}>注册账号</Link>
          <span style={{ color: U.textLight }}>忘记密码？联系管理员</span>
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
