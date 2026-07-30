import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { U, E } from "./shared";
import { useAuth } from "./useAuth";
import { User, Settings, Check } from "lucide-react";
import type { SchemaPayload } from "../../api/types";

export default function UserMenu({ dark }: { dark?: boolean }) {
  const { user, loading, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const c = dark ? "#fff" : U.textMid;

  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(
    () => localStorage.getItem("selected_model")
  );

  useEffect(() => {
    fetch("/api/v1/schema")
      .then(r => r.json())
      .then((s: SchemaPayload) => {
        if (s.models) {
          setModels(s.models.available);
          setDefaultModel(s.models.default);
        }
      })
      .catch(() => {});
  }, []);

  const handleModelChange = (id: string) => {
    setSelectedModel(id);
    localStorage.setItem("selected_model", id);
    setModelOpen(false);
    setOpen(false);
  };

  // 当前选中的模型名（用于显示）
  const selectedLabel = selectedModel
    ? models.find(m => m.id === selectedModel)?.label || selectedModel
    : (defaultModel ? models.find(m => m.id === defaultModel)?.label || "默认" : "选择模型");

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setModelOpen(false);
      }
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
          width: 200, background: "#fff", borderRadius: 10,
          border: `1px solid ${U.border}`, boxShadow: "0 4px 16px rgba(0,0,0,.08)",
          padding: 4, fontSize: 13,
        }}>
          <div style={{ padding: "8px 12px", fontSize: 11, color: U.textLight, borderBottom: `1px solid ${U.borderLight}`, marginBottom: 4 }}>
            {user.email_address}
          </div>

          {/* 模型选择入口 */}
          {models.length > 0 && (
            <button onClick={(e) => { e.stopPropagation(); setModelOpen(true); }} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "7px 12px", borderRadius: 6, border: "none",
              background: "none", cursor: "pointer", textAlign: "left",
              fontSize: 12, color: U.textMid, boxSizing: "border-box",
              borderBottom: `1px solid ${U.borderLight}`, marginBottom: 4,
            }}>
              <Settings size={12} />
              <span style={{ flex: 1 }}>AI 模型</span>
              <span style={{ fontSize: 10, color: U.textLight }}>{selectedLabel}</span>
            </button>
          )}

          {user.admin && (
            <a href="/admin" style={itemStyle}>管理后台</a>
          )}
          <button onClick={() => { setOpen(false); nav("/change-password"); }} style={itemStyle}>
            修改密码
          </button>
          <button onClick={() => { logout(); nav("/login"); setOpen(false); }} style={itemStyle}>
            退出登录
          </button>
        </div>
      )}

      {/* 模型选择弹窗 */}
      {modelOpen && models.length > 0 && (
        <>
          <div style={{
            position: "fixed", inset: 0, background: "rgba(20,35,55,.32)",
            backdropFilter: "blur(4px)", zIndex: 998,
          }} onClick={() => setModelOpen(false)} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            width: 320, maxWidth: "90vw", background: "#fff", borderRadius: 14,
            boxShadow: "0 16px 60px rgba(20,35,55,.22)", zIndex: 999,
            padding: 20, fontFamily: "'Outfit',sans-serif",
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: U.text, marginBottom: 4 }}>
              AI 模型选择
            </div>
            <div style={{ fontSize: 11, color: U.textLight, marginBottom: 16 }}>
              选择一个模型用于信息提取。默认为 <strong>{defaultModel ? models.find(m => m.id === defaultModel)?.label || defaultModel : "未设置"}</strong>。
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {models.map(m => {
                const active = (selectedModel || defaultModel) === m.id;
                return (
                  <button key={m.id} onClick={() => handleModelChange(m.id)} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", borderRadius: 10, cursor: "pointer",
                    border: active ? `1.5px solid ${U.blue}` : `1px solid ${U.borderLight}`,
                    background: active ? U.blueXLight : U.surface,
                    textAlign: "left", width: "100%",
                    transition: `all .15s ${E.smooth}`,
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                      border: active ? `5px solid ${U.blue}` : `1.5px solid ${U.textFaint}`,
                      transition: `all .2s ${E.spring}`,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? U.blue : U.text }}>
                        {m.label}
                      </div>
                      {m.id === defaultModel && (
                        <span style={{ fontSize: 10, color: U.textLight }}>默认模型</span>
                      )}
                    </div>
                    {active && <Check size={14} color={U.blue} />}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setModelOpen(false)} style={{
              width: "100%", padding: "10px 0", marginTop: 12, borderRadius: 10,
              border: `1px solid ${U.border}`, background: U.surface,
              cursor: "pointer", fontSize: 12, color: U.textMid,
            }}>
              关闭
            </button>
          </div>
        </>
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
