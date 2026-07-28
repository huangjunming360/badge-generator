import { Link, useNavigate } from "react-router";
import { U } from "./shared";
import { useAuth } from "./useAuth";

export default function TopBar() {
  const { user, loading, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
      display: "flex", alignItems: "center", justifyContent: "flex-end",
      gap: 12, padding: "10px 16px", background: "#fff",
      borderBottom: `1px solid ${U.borderLight}`, fontSize: 13,
    }}>
      {loading ? (
        <span style={{ color: U.textLight }}>…</span>
      ) : user ? (
        <>
          <span style={{ color: U.textLight }}>{user.email_address}</span>
          {user.admin && (
            <a href="/admin" style={{ color: U.textMid, textDecoration: "none" }}>后台</a>
          )}
          <button onClick={() => { logout(); nav("/login"); }} style={{
            background: "none", border: "none", cursor: "pointer",
            color: U.textLight, padding: 0, fontSize: 13,
          }}>退出</button>
        </>
      ) : (
        <>
          <Link to="/login" style={{ color: U.textMid, textDecoration: "none" }}>登录</Link>
          <span style={{ color: U.border }}>|</span>
          <Link to="/register" style={{ color: U.textMid, textDecoration: "none" }}>注册</Link>
        </>
      )}
    </div>
  );
}
