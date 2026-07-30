import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { U, E } from "./shared";
import { useAuth } from "./useAuth";
import { User } from "lucide-react";
import { fetchSchema } from "../../api/cards";

export default function UserMenu({ dark }: { dark?: boolean }) {
  const { user, loading, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [studioAvailable, setStudioAvailable] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const c = dark ? "#fff" : U.textMid;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchSchema().then(schema => setStudioAvailable(schema.template_studio.available)).catch(() => setStudioAvailable(false));
  }, [user]);

  if (loading) return null;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      {user ? (
        <button onClick={() => setOpen(!open)} style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "5px 10px", borderRadius: 8, border: "none",
          background: open ? (dark ? "rgba(255,255,255,.15)" : U.surfaceBlue) : "transparent",
          cursor: "pointer", fontSize: 12, color: c,
          transition: `all .15s ${E.smooth}`,
        }}>
          <User size={14} />
        </button>
      ) : (
        <div style={{ display: "flex", gap: 4 }}>
          <a href="/login" style={linkStyle(c)}>登录</a>
          <a href="/register" style={linkStyle(c)}>注册</a>
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
            <>
              <a href="/admin" style={itemStyle}>管理后台</a>
              <a href="/admin/templates" style={itemStyle}>模板工作台</a>
            </>
          )}
          {!user.admin && studioAvailable && <a href="/templates" style={itemStyle}>我的模板</a>}
          <button onClick={() => { setOpen(false); nav("/change-password"); }} style={itemStyle}>
            修改密码
          </button>
          <button onClick={() => { logout(); nav("/login"); setOpen(false); }} style={itemStyle}>
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}

const linkStyle = (c: string): React.CSSProperties => ({
  padding: "4px 8px", borderRadius: 6, fontSize: 12,
  color: c, textDecoration: "none",
});

const itemStyle: React.CSSProperties = {
  display: "block", width: "100%", padding: "7px 12px", borderRadius: 6,
  border: "none", background: "none", cursor: "pointer", textAlign: "left",
  fontSize: 12, color: U.textMid, textDecoration: "none", boxSizing: "border-box",
  transition: "background .1s",
};
