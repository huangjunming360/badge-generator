import { U } from "./shared";

export default function InactivePage() {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: U.bg, padding: 24, fontFamily: "'Outfit',sans-serif",
    }}>
      <div style={{
        width: 380, maxWidth: "100%", background: U.surface,
        borderRadius: 16, padding: 36, boxShadow: "0 4px 24px rgba(0,0,0,.06)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: U.text, marginBottom: 8 }}>账号尚未激活</h1>
        <p style={{ fontSize: 13, color: U.textLight, lineHeight: 1.6, marginBottom: 24 }}>
          您的账号还未被管理员激活，请等待管理员操作或联系管理员。
        </p>
        <a href="/login" style={{
          display: "inline-block", padding: "10px 24px", borderRadius: 10,
          background: U.blue, color: "#fff", fontSize: 13, fontWeight: 600,
          textDecoration: "none",
        }}>返回登录</a>
      </div>
    </div>
  );
}
