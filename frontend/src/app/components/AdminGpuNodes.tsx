import { useEffect, useMemo, useState } from "react";
import { Copy, Cpu, KeyRound, LoaderCircle, Plus, PowerOff, RefreshCw, ShieldCheck, X } from "lucide-react";
import { ApiError } from "../../api/client";
import {
  createGpuNode,
  fetchGpuNodes,
  revokeGpuNode,
  rotateGpuNodeToken,
  updateGpuNodeConfig,
  type GpuNode,
  type NodeCredentials,
} from "../../api/gpuNodes";
import { U } from "./shared";

const defaultServerUrl = () => window.location.origin;

function statusLabel(node: GpuNode) {
  if (!node.active) return "已撤销";
  if (!node.online) return "离线";
  if (node.desired_config.paused) return "已暂停";
  if (!node.ready) return "准备中";
  return "可接单";
}

function statusColor(node: GpuNode) {
  if (node.ready) return "#197b4c";
  if (!node.active) return "#7a8795";
  if (node.desired_config.paused) return "#a46a18";
  return "#a9473c";
}

export default function AdminGpuNodes() {
  const [nodes, setNodes] = useState<GpuNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("家庭 4090");
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);
  const [credentials, setCredentials] = useState<NodeCredentials | null>(null);
  const [notice, setNotice] = useState("");

  const installText = useMemo(() => {
    if (!credentials) return "";
    return Object.entries(credentials.environment)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
  }, [credentials]);

  const load = async () => {
    try {
      setNodes(await fetchGpuNodes());
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "无法读取节点状态");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const run = async (id: number | null, action: () => Promise<void>) => {
    setBusyId(id);
    setNotice("");
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "操作失败，请稍后重试");
    } finally {
      setBusyId(null);
    }
  };

  const create = () => run(null, async () => {
    const response = await createGpuNode(name.trim(), serverUrl.trim());
    setCredentials(response.credentials);
    setShowCreate(false);
    setNodes((current) => [ response.node, ...current ]);
  });

  const copyInstall = async () => {
    try {
      await navigator.clipboard.writeText(installText);
      setNotice("安装配置已复制；关闭此窗口后令牌不会再次显示");
    } catch {
      setNotice("浏览器无法复制，请手动保存安装配置");
    }
  };

  return <main style={pageStyle}>
    <header style={headerStyle}>
      <div>
        <div style={eyebrowStyle}><Cpu size={15} /> 私有计算节点</div>
        <h1 style={{ margin: "8px 0 5px", fontSize: 27, letterSpacing: 0 }}>GPU 节点</h1>
        <p style={{ margin: 0, color: U.textMid, fontSize: 13 }}>节点主动连接控制面；模型端口始终保留在家庭设备本机。</p>
      </div>
      <button style={primaryButton} onClick={() => setShowCreate(true)}><Plus size={17} /> 创建节点</button>
    </header>

    {notice && <div style={noticeStyle}>{notice}</div>}

    <section style={cardStyle}>
      <div style={sectionHeader}><strong>节点状态</strong><button style={iconButton} title="刷新状态" onClick={() => void load()}><RefreshCw size={16} /></button></div>
      {loading ? <div style={emptyStyle}><LoaderCircle className="gpu-spin" size={18} /> 正在读取节点</div> : nodes.length === 0 ? <div style={emptyStyle}><Cpu size={22} /> 尚未创建节点。创建后会得到一份仅显示一次的安装配置。</div> : <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead><tr><th>节点</th><th>状态</th><th>能力</th><th>任务</th><th>工作方式</th><th /></tr></thead>
          <tbody>{nodes.map((node) => <tr key={node.id}>
            <td><strong>{node.name}</strong><small style={subtleStyle}>{node.node_key}</small></td>
            <td><span style={{ ...statusPill, color: statusColor(node), background: `${statusColor(node)}12` }}>{statusLabel(node)}</span><small style={subtleStyle}>{node.last_seen_at ? new Date(node.last_seen_at).toLocaleString() : "从未心跳"}</small></td>
            <td><small>{node.capabilities.gpu_name ? String(node.capabilities.gpu_name) : "等待硬件上报"}</small><small style={subtleStyle}>MAI {node.capabilities.mai_ready === true ? "已就绪" : "未就绪"} / 渲染器 {node.capabilities.renderer_ready === true ? "已就绪" : "未就绪"}</small></td>
            <td>{node.leased_jobs_count} 个进行中</td>
            <td><label style={compactLabel}>轮数<select value={node.desired_config.max_iterations} disabled={!node.active || busyId === node.id} onChange={(event) => void run(node.id, async () => { const updated = await updateGpuNodeConfig(node.id, node.desired_config.paused, Number(event.target.value)); setNodes((current) => current.map((item) => item.id === node.id ? updated : item)); })}><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label><button style={node.desired_config.paused ? resumeButton : pauseButton} disabled={!node.active || busyId === node.id} onClick={() => void run(node.id, async () => { const updated = await updateGpuNodeConfig(node.id, !node.desired_config.paused, node.desired_config.max_iterations); setNodes((current) => current.map((item) => item.id === node.id ? updated : item)); })}>{node.desired_config.paused ? "恢复接单" : "暂停接单"}</button><small style={subtleStyle}>单并发</small></td>
            <td><div style={{ display: "flex", gap: 5 }}><button style={iconButton} disabled={!node.active || busyId === node.id} title="轮换节点密钥" onClick={() => void run(node.id, async () => { const response = await rotateGpuNodeToken(node.id, serverUrl.trim()); setCredentials(response.credentials); setNodes((current) => current.map((item) => item.id === node.id ? response.node : item)); })}><KeyRound size={15} /></button><button style={{ ...iconButton, color: "#a9473c" }} disabled={!node.active || busyId === node.id} title="撤销节点并释放任务" onClick={() => { if (window.confirm(`撤销 ${node.name} 后，已租任务会回到队列，节点必须重新创建凭据才能接单。`)) void run(node.id, async () => { const response = await revokeGpuNode(node.id); setNodes((current) => current.map((item) => item.id === node.id ? response.node : item)); setNotice(`节点已撤销，释放了 ${response.released_jobs} 个任务`); }); }}><PowerOff size={15} /></button></div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>

    <section style={infoStyle}><ShieldCheck size={18} /><div><strong>访问边界</strong><p>节点 token 仅可认证内部心跳接口，不能读取用户会话、数据库或模型密钥。暂停只阻止领取新任务，不会中断已经完成中的视觉修复。</p></div></section>

    {showCreate && <div style={overlayStyle}><section style={dialogStyle}><button style={{ ...iconButton, position: "absolute", right: 14, top: 14 }} onClick={() => setShowCreate(false)} title="关闭"><X size={16} /></button><div style={eyebrowStyle}><Cpu size={15} /> 新私有节点</div><h2 style={{ margin: "8px 0 18px", letterSpacing: 0 }}>生成安装配置</h2><label style={fieldStyle}>显示名称<input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} /></label><label style={fieldStyle}>控制面地址<input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="http://10.x.x.x:8000" /></label><p style={helpStyle}>填写 4090 电脑能访问的 ZeroTier 地址，不是 vLLM 的 18000 端口。</p><button style={primaryButton} disabled={!name.trim() || !serverUrl.trim() || busyId !== null} onClick={() => void create()}>{busyId === null ? <KeyRound size={16} /> : <LoaderCircle className="gpu-spin" size={16} />} 创建并显示密钥</button></section></div>}

    {credentials && <div style={overlayStyle}><section style={{ ...dialogStyle, maxWidth: 620 }}><div style={eyebrowStyle}><ShieldCheck size={15} /> 仅显示一次</div><h2 style={{ margin: "8px 0" }}>将配置放到 4090 的 `.env`</h2><p style={helpStyle}>关闭此窗口后 token 不会再次显示。请先保存，再启动 `badge-template-agent`。</p><pre style={codeStyle}>{installText}</pre><div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}><button style={secondaryButton} onClick={() => void copyInstall()}><Copy size={15} /> 复制配置</button><button style={primaryButton} onClick={() => setCredentials(null)}>已保存</button></div></section></div>}
    <style>{`.gpu-spin{animation:gpu-spin 1s linear infinite}@keyframes gpu-spin{to{transform:rotate(360deg)}}@media(max-width:760px){.gpu-page{padding:20px}.gpu-header{align-items:flex-start;flex-direction:column}}`}</style>
  </main>;
}

const pageStyle: React.CSSProperties = { minHeight: "100vh", padding: "38px clamp(18px, 5vw, 72px)", background: "#f5f7fa", color: U.text, fontFamily: "Inter, PingFang SC, sans-serif" };
const headerStyle: React.CSSProperties = { maxWidth: 1220, margin: "0 auto 28px", display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center" };
const eyebrowStyle: React.CSSProperties = { display: "flex", gap: 7, alignItems: "center", color: U.blue, fontSize: 12, fontWeight: 700 };
const primaryButton: React.CSSProperties = { border: 0, borderRadius: 8, padding: "10px 14px", background: U.blueDark, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer", font: "inherit", fontSize: 13, fontWeight: 650 };
const secondaryButton: React.CSSProperties = { ...primaryButton, background: "#eef2f6", color: U.textMid };
const cardStyle: React.CSSProperties = { maxWidth: 1220, margin: "0 auto", border: `1px solid ${U.border}`, borderRadius: 8, background: "#fff", overflow: "hidden" };
const sectionHeader: React.CSSProperties = { padding: "15px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${U.borderLight}`, fontSize: 14 };
const iconButton: React.CSSProperties = { width: 32, height: 32, border: `1px solid ${U.border}`, borderRadius: 7, background: "#fff", display: "grid", placeItems: "center", cursor: "pointer" };
const emptyStyle: React.CSSProperties = { minHeight: 170, display: "flex", alignItems: "center", justifyContent: "center", gap: 9, color: U.textLight, fontSize: 13, padding: 20 };
const tableStyle: React.CSSProperties = { borderCollapse: "collapse", width: "100%", minWidth: 900, fontSize: 13 };
const subtleStyle: React.CSSProperties = { display: "block", marginTop: 4, color: U.textLight, fontSize: 11 };
const statusPill: React.CSSProperties = { display: "inline-block", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 700 };
const compactLabel: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, color: U.textMid, fontSize: 11, marginRight: 7 };
const pauseButton: React.CSSProperties = { border: "1px solid #f0d7a2", background: "#fffaf0", color: "#9a681d", borderRadius: 6, padding: "5px 8px", fontSize: 11, cursor: "pointer", marginRight: 6 };
const resumeButton: React.CSSProperties = { border: "1px solid #bcdfce", background: "#f2fbf6", color: "#277a4e", borderRadius: 6, padding: "5px 8px", fontSize: 11, cursor: "pointer", marginRight: 6 };
const infoStyle: React.CSSProperties = { maxWidth: 1220, margin: "18px auto", padding: "14px 16px", display: "flex", gap: 10, border: "1px solid #cae0f8", borderRadius: 8, background: "#f0f7ff", color: U.textMid, fontSize: 12, lineHeight: 1.55 };
const noticeStyle: React.CSSProperties = { maxWidth: 1220, margin: "0 auto 14px", padding: "10px 13px", borderRadius: 7, background: "#fff7e8", color: "#8a5c17", fontSize: 12 };
const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 1000, background: "rgba(23, 35, 50, .42)", display: "grid", placeItems: "center", padding: 18 };
const dialogStyle: React.CSSProperties = { position: "relative", width: "min(100%, 440px)", borderRadius: 8, background: "#fff", padding: 24, boxShadow: "0 20px 70px rgba(22,38,60,.25)" };
const fieldStyle: React.CSSProperties = { display: "grid", gap: 6, marginBottom: 13, color: U.textMid, fontSize: 12, fontWeight: 650 };
const helpStyle: React.CSSProperties = { color: U.textLight, fontSize: 12, lineHeight: 1.55, margin: "0 0 16px" };
const codeStyle: React.CSSProperties = { overflowX: "auto", whiteSpace: "pre-wrap", padding: 14, margin: "16px 0", borderRadius: 7, background: "#17283b", color: "#e9f2fb", fontSize: 12, lineHeight: 1.6 };
