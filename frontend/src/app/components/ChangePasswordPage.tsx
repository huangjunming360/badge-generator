import { useState } from "react";
import { useNavigate } from "react-router";
import { U, E } from "./shared";
import { sendJson } from "../../api/client";

export default function ChangePasswordPage() {
  const nav = useNavigate();
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPw.length < 6) { setError("新密码至少 6 位"); return; }
    if (newPw !== confirm) { setError("两次新密码不一致"); return; }
    setLoading(true);
    try {
      await sendJson("/api/v1/password", "PATCH", {
        current_password: current,
        new_password: newPw,
        new_password_confirmation: confirm,
      });
      setDone(true);
    } catch (err: any) {
      setError(err.errors?.[0] || "修改失败");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: U.bg }}>
        <div style={{ width: 380, background: U.surface, borderRadius: 16, padding: 36, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,.06)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: U.text, marginBottom: 16 }}>密码已更新</h1>
          <button onClick={() => nav("/")} style={{ padding: "10px 24px", borderRadius: 10, background: U.blue, color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>返回首页</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: U.bg, padding: 24 }}>
      <form onSubmit={handleSubmit} style={{ width: 380, maxWidth: "100%", background: U.surface, borderRadius: 16, padding: 36, boxShadow: "0 4px 24px rgba(0,0,0,.06)" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: U.text, marginBottom: 24 }}>修改密码</h1>
        {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", color: "#DC2626", fontSize: 13, marginBottom: 16 }}>{error}</div>}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: U.textMid, marginBottom: 5 }}>当前密码</label>
          <input type="password" required autoFocus value={current} onChange={e => setCurrent(e.target.value)}
            style={{ display: "block", width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid " + U.borderLight, borderRadius: 10, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: U.textMid, marginBottom: 5 }}>新密码</label>
          <input type="password" required value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="至少 6 位"
            style={{ display: "block", width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid " + U.borderLight, borderRadius: 10, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: U.textMid, marginBottom: 5 }}>确认新密码</label>
          <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
            style={{ display: "block", width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid " + U.borderLight, borderRadius: 10, outline: "none", boxSizing: "border-box" }} />
        </div>
        <button type="submit" disabled={loading} style={{ width: "100%", padding: "11px 0", borderRadius: 10, border: "none", background: loading ? U.textFaint : U.blue, color: "#fff", fontSize: 14, fontWeight: 600, cursor: loading ? "default" : "pointer" }}>{loading ? "修改中…" : "修改密码"}</button>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: U.textLight, cursor: "pointer" }} onClick={() => nav("/")}>← 返回</div>
      </form>
    </div>
  );
}
