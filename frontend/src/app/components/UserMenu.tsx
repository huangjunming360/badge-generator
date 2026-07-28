import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { U, E } from "./shared";
import { useAuth } from "./useAuth";
import { User } from "lucide-react";

export default function UserMenu() {
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
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      {user ? (
        <button onClick={() => setOpen(!open)} style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "5px 10px", borderRadius: 8, border: "none",
          background: open ? U.surfaceBlue : "transparent",
          cursor: "pointer", fontSize: 12, color: U.textMid,
          transition: `all .15s ${E.smooth}`,
        }}>
          <User size={14} />
        </button>
      ) : (
        <div style={{ display: "flex", gap: 4 }}>
          <a href="/login" style={linkStyle}>登录</a>
          <a href="/register" style={linkStyle}>注册</a>
        </div>
      )}

      {open && user && (
        <div style={{
          position: "absolute", right: 0, top: "100%", marginTop: 4, zIndex: 999,
          width: 180, background: "#fff", borderRadius: 10,
          border: `1px solid ${U.border}`, boxShadow: "0 4px 16px rgba(0,0,0,.08)",
          padding: 4, fontSize: 13,
        }}>
          <div style={{ padding: "8px 12px", fontSize: 11, color: U.textLight, borderBottom: `1px solid ${U.borderLight}`, marginBottom: 4 }}>
            {user.email_address}
          </div>
          {user.admin && (
            <a href="/admin" style={itemStyle}>管理后台</a>
          )}
          <button onClick={() => { logout(); nav("/login"); setOpen(false); }} style={itemStyle}>
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  padding: "4px 8px", borderRadius: 6, fontSize: 12,
  color: U.textMid, textDecoration: "none",
};

const itemStyle: React.CSSProperties = {
  display: "block", width: "100%", padding: "8px 12px", borderRadius: 6,
  border: "none", background: "none", cursor: "pointer", textAlign: "left",
  fontSize: 13, color: U.textMid, textDecoration: "none", boxSizing: "border-box",
};
