import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { U, E } from "./shared";
import { useAuth } from "./useAuth";

export default function TopBar() {
  const { user, loading, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (loading) return null;

  return (
    <div ref={ref} style={{ position: "fixed", top: 12, left: 12, zIndex: 999 }}>
      {user ? (
        <>
          <button onClick={() => setOpen(!open)} style={{
            padding: "6px 12px", borderRadius: 8, border: `1px solid ${U.borderLight}`,
            background: "#fff", cursor: "pointer", fontSize: 12, color: U.textMid,
            boxShadow: "0 2px 8px rgba(0,0,0,.06)",
          }}>
            {user.email_address}
          </button>
          {open && (
            <div style={{
              position: "absolute", right: 0, top: "100%", marginTop: 4,
              width: 180, background: "#fff", borderRadius: 10,
              border: `1px solid ${U.borderLight}`, boxShadow: "0 4px 16px rgba(0,0,0,.08)",
              padding: 4, fontSize: 13,
            }}>
              {user.admin && (
                <a href="/admin" style={dropdownItemStyle}>
                  管理后台
                </a>
              )}
              <button onClick={() => { logout(); nav("/login"); setOpen(false); }} style={dropdownItemStyle}>
                退出登录
              </button>
            </div>
          )}
        </>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <Link to="/login" style={btnStyle}>登录</Link>
          <Link to="/register" style={{ ...btnStyle, background: U.blue, color: "#fff", border: "none" }}>注册</Link>
        </div>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 8, border: `1px solid ${U.borderLight}`,
  background: "#fff", cursor: "pointer", fontSize: 12, color: U.textMid,
  textDecoration: "none", boxShadow: "0 2px 8px rgba(0,0,0,.06)",
};

const dropdownItemStyle: React.CSSProperties = {
  display: "block", width: "100%", padding: "8px 12px", borderRadius: 6,
  border: "none", background: "none", cursor: "pointer", textAlign: "left",
  fontSize: 13, color: U.textMid, textDecoration: "none", boxSizing: "border-box",
};
