import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ImagePlus,
  History,
  LoaderCircle,
  Pause,
  Plus,
  Save,
  Send,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate } from "react-router";
import { fetchSchema } from "../../api/cards";
import {
  appendDesignMessage,
  createDesignSession,
  fetchDesignSession,
  fetchDesignSessions,
  interruptDesignSession,
  type DesignMessage,
  type DesignSession,
} from "../../api/designSessions";
import { ApiError } from "../../api/client";
import {
  createAdminTemplate,
  createStudioTemplate,
  publishTemplate,
  type BadgeTemplate,
} from "../../api/templates";
import { U } from "./shared";

const sample = {
  name: "林小明",
  name_en: "Xiaoming Lin",
  organization: "北京大学物理学院",
  event_topic: "夏令营",
  portrait_url: "/default-avatar.svg",
};
const sampleLiquid = (source: string) =>
  source.replace(
    /{{\s*(?:card|fields)\.([\w_]+)\s*}}/g,
    (_, key) => sample[key as keyof typeof sample] ?? "",
  );

export default function TemplateDesignChat({
  studio = false,
}: {
  studio?: boolean;
}) {
  const nav = useNavigate();
  const [sessions, setSessions] = useState<DesignSession[]>([]);
  const [session, setSession] = useState<DesignSession | null>(null);
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("夏令营名牌");
  const [complexity, setComplexity] = useState(6);
  const [width, setWidth] = useState(55);
  const [height, setHeight] = useState(85);
  const [modelId, setModelId] = useState<string | null>(null);
  const [assets, setAssets] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [savedTemplate, setSavedTemplate] = useState<BadgeTemplate | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const refreshList = () =>
    fetchDesignSessions()
      .then(setSessions)
      .catch(() => setSessions([]));

  useEffect(() => {
    refreshList();
    fetchSchema()
      .then((schema) => {
        setModels(schema.models.available);
        setModelId(schema.models.default ?? null);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!session?.active_job) return;
    const timer = window.setInterval(
      () =>
        fetchDesignSession(session.id)
          .then(setSession)
          .then(refreshList)
          .catch(() => {}),
      1500,
    );
    return () => window.clearInterval(timer);
  }, [session?.id, session?.active_job?.id]);
  useEffect(() => {
    if (!session?.active_job) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [session?.active_job?.id]);

  const proposalMessage = useMemo(
    () =>
      session?.messages
        ?.slice()
        .reverse()
        .find((message) => message.metadata.proposal),
    [session],
  );
  const proposal = proposalMessage?.metadata.proposal as
    DesignMessage["metadata"]["proposal"] | undefined;
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      setNotice(
        error instanceof ApiError ? error.message : "操作失败，请稍后重试",
      );
    } finally {
      setBusy(false);
    }
  };
  const start = () =>
    run(async () => {
      if (!draft.trim()) throw new Error("请先描述你想要的名牌风格");
      const next = await createDesignSession({
        name: title,
        initial_message: draft,
        assets,
        configuration: {
          complexity,
          width_mm: width,
          height_mm: height,
          model_id: modelId,
          reference_notes: "",
        },
      });
      setSession(next);
      setDraft("");
      setAssets([]);
      refreshList();
    });
  const send = () =>
    run(async () => {
      if (!session || !draft.trim()) return;
      await appendDesignMessage(session.id, {
        content: draft,
        assets,
        configuration: {
          complexity,
          width_mm: width,
          height_mm: height,
          model_id: modelId,
        },
      });
      setDraft("");
      setAssets([]);
      setSession(await fetchDesignSession(session.id));
      refreshList();
    });
  const interrupt = () =>
    run(async () => {
      if (!session) return;
      await interruptDesignSession(session.id);
      if (draft.trim()) {
        const result = await appendDesignMessage(session.id, {
          content: draft,
          assets,
          configuration: {
            complexity,
            width_mm: width,
            height_mm: height,
            model_id: modelId,
          },
        });
        setDraft("");
        setAssets([]);
        setSession(result.session);
      } else {
        setSession(await fetchDesignSession(session.id));
      }
      refreshList();
    });
  const saveProposal = () =>
    run(async () => {
      if (!session || !proposal?.html || !proposal.css) return;
      const create = studio ? createStudioTemplate : createAdminTemplate;
      const template = await create({
        name: session.name,
        orientation: width >= height ? "landscape" : "portrait",
        width_mm: width,
        height_mm: height,
        html: proposal.html,
        css: proposal.css,
        semantic_fields: session.configuration.semantic_fields,
        generation_job_id: proposalMessage?.metadata.job_id,
      });
      setSavedTemplate(template);
      setNotice("审核通过，已保存为草稿版本");
    });
  const publishProposal = () =>
    run(async () => {
      const version = savedTemplate?.versions?.[0];
      if (!savedTemplate || !version) return;
      await publishTemplate(savedTemplate.id, version.id);
      setNotice("版本已发布");
    });
  const messages = session?.messages ?? [];
  const elapsed = session?.active_job
    ? Math.max(
        0,
        Math.floor(
          (now - new Date(session.active_job.created_at).getTime()) / 1_000,
        ),
      )
    : 0;
  const elapsedLabel =
    elapsed >= 60
      ? `${Math.floor(elapsed / 60)} 分 ${elapsed % 60} 秒`
      : `${elapsed} 秒`;

  if (!session)
    return (
      <div style={shell} className={historyOpen ? "history-open" : ""}>
        <style>{styles}</style>
        <style>{responsiveHistoryStyles}</style>
        <aside className="design-sidebar">
          <button className="history-close" onClick={() => setHistoryOpen(false)} title="关闭历史记录">
            <X size={15} /> 收起
          </button>
          <button className="back-control" onClick={() => nav("/")}>
            <ArrowLeft size={15} /> 返回主页
          </button>
          <strong>{studio ? "我的设计" : "模板设计"}</strong>
          <button className="new-session" onClick={() => setSession(null)}>
            <Plus size={15} /> 新建设计
          </button>
          {sessions.map((item) => (
            <button
              className="session-item"
              key={item.id}
              onClick={() => fetchDesignSession(item.id).then(setSession)}
            >
              {item.name}
              <small>{item.active_job ? "处理中" : "已保存"}</small>
            </button>
          ))}
      </aside>
        <main className="design-start">
          <div className="start-inner">
          <button className="history-toggle" onClick={() => setHistoryOpen((open) => !open)}>
            <History size={15} /> 历史记录
          </button>
          <button className="start-back" onClick={() => nav("/")}>
            <ArrowLeft size={15} /> 返回主页
          </button>
          <span className="eyebrow">
              <Sparkles size={15} /> AI 模板设计
            </span>
            <h1>从一句需求开始</h1>
            <p>先确定成品尺寸、视觉密度和参考素材，之后在对话中持续调整。</p>
            <input
              className="title-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="设计名称"
            />
            <div className="config-grid">
                <label>
                宽度 mm
                <input
                  type="number"
                  min="20"
                  max="200"
                  value={width}
                  onChange={(event) => setWidth(Number(event.target.value))}
                />
              </label>
              <label>
                高度 mm
                <input
                  type="number"
                  min="20"
                  max="200"
                  value={height}
                  onChange={(event) => setHeight(Number(event.target.value))}
                />
              </label>
              <label>
                视觉密度
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={complexity}
                  onChange={(event) =>
                    setComplexity(Number(event.target.value))
                  }
                />
                <small>{complexity} / 10</small>
              </label>
              <label>
                模型
                <select
                  value={modelId ?? ""}
                  onChange={(event) => setModelId(event.target.value || null)}
                >
                  <option value="">后台默认</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
                </label>
              </div>
              {models.length === 0 && <a className="model-link" href="/admin/models">配置生成模型</a>}
            <textarea
              className="brief"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="例如：做一张适合打印的深蓝色夏令营名牌，带有克制的几何装饰，姓名应清晰突出。"
            />
            <label className="upload">
              <ImagePlus size={17} /> 添加参考素材
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) =>
                  setAssets(Array.from(event.target.files ?? []))
                }
              />
            </label>
            {assets.length > 0 && (
              <small>{assets.map((asset) => asset.name).join("、")}</small>
            )}
            <button className="start-button" onClick={start} disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}{" "}
              开始设计
            </button>
            {notice && <p className="notice">{notice}</p>}
          </div>
        </main>
      </div>
    );

  return (
    <div style={shell} className={historyOpen ? "history-open" : ""}>
      <style>{styles}</style>
      <style>{responsiveHistoryStyles}</style>
      <aside className="design-sidebar">
        <button className="history-close" onClick={() => setHistoryOpen(false)} title="关闭历史记录">
          <X size={15} /> 收起
        </button>
        <button className="back-control" onClick={() => nav("/")}>
          <ArrowLeft size={15} /> 返回主页
        </button>
        <strong>{studio ? "我的设计" : "模板设计"}</strong>
        <button className="new-session" onClick={() => setSession(null)}>
          <Plus size={15} /> 新建设计
        </button>
        {sessions.map((item) => (
          <button
            className={`session-item ${item.id === session.id ? "active" : ""}`}
            key={item.id}
            onClick={() => fetchDesignSession(item.id).then(setSession)}
          >
            {item.name}
            <small>{item.active_job ? "处理中" : "已保存"}</small>
          </button>
        ))}
      </aside>
      <main className="chat-main">
        <header>
          <div>
            <span className="eyebrow">
              <Sparkles size={14} /> AI 设计会话
            </span>
            <h2>{session.name}</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="history-toggle" onClick={() => setHistoryOpen((open) => !open)}><History size={15} /> 历史</button>
            <button className="icon-control" title="修改设计参数" onClick={() => setSettingsOpen(true)}><SlidersHorizontal size={17} /></button>
          </div>
        </header>
        <section className="message-list">
          {messages.map((message) => (
            <article className={`message ${message.role}`} key={message.id}>
              <div className="message-label">
                {message.role === "user" ? "你" : "设计助手"}
              </div>
              <div className="bubble">
                {message.content}
                {message.assets.map((asset) => (
                  <img key={asset.id} src={asset.url} alt={asset.name} />
                ))}
                {message.state === "queued" && (
                  <small>
                    <Clock3 size={13} /> 等待当前设计完成后发送
                  </small>
                )}
                {message.state === "processing" && (
                  <small>
                    <LoaderCircle className="spin" size={13} /> 正在生成
                  </small>
                )}
              </div>
            </article>
          ))}
          {session.active_job && (
            <div className="task-line">
              <LoaderCircle className="spin" size={15} />
              <span>
                {session.active_job.stage_message || "正在处理设计任务"}
              </span>
              <small>已处理 {elapsedLabel} · 自动刷新</small>
            </div>
          )}
        </section>
        <footer className="composer">
          <div className="config-strip">
            {width} × {height} mm <span /> 密度 {complexity}/10 <span />{" "}
            {models.find((model) => model.id === modelId)?.label ?? "默认模型"}
          </div>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="继续描述你希望怎样调整..."
          />
          <div className="compose-actions">
            <label className="attach" title="添加参考素材">
              <ImagePlus size={18} />
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) =>
                  setAssets(Array.from(event.target.files ?? []))
                }
              />
            </label>
            {assets.length > 0 && <small>{assets.length} 个素材待发送</small>}
            <span />
            {session.active_job && (
              <button className="pause-button" onClick={interrupt} disabled={busy}>
                <Pause size={15} /> {draft.trim() ? "暂停并发送" : "停止"}
              </button>
            )}
            <button
              className="send-button"
              onClick={send}
              disabled={busy || !draft.trim()}
              title="发送需求"
            >
              <Send size={16} />
            </button>
          </div>
          {notice && <p className="notice">{notice}</p>}
        </footer>
      </main>
      {proposal?.html && (
        <aside className="preview-panel">
          <div>
            <span>审核草案</span>
            <CheckCircle2 size={16} />
          </div>
          <div
            className="preview-stage"
            style={{ aspectRatio: `${width}/${height}` }}
          >
            <iframe
              title="设计草案预览"
              sandbox="allow-same-origin"
              srcDoc={`<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}${proposal.css ?? ""}</style>${sampleLiquid(proposal.html)}`}
            />
          </div>
          <small>{proposal.notes}</small>
          <button
            className="start-button"
            onClick={saveProposal}
            disabled={busy || !!savedTemplate}
          >
            <Save size={16} />{" "}
            {savedTemplate ? "草稿已保存" : "审核通过并保存草稿"}
          </button>
          {!studio && savedTemplate && (
            <button
              className="start-button"
              onClick={publishProposal}
              disabled={busy}
            >
              发布此版本
            </button>
          )}
        </aside>
      )}
      {settingsOpen && (
        <div className="settings-overlay">
          <section className="settings-dialog">
            <button
              className="icon-control settings-close"
              onClick={() => setSettingsOpen(false)}
              title="关闭"
            >
              <X size={16} />
            </button>
            <strong>设计参数</strong>
              <div className="config-grid">
              <label>
                宽度 mm
                <input
                  type="number"
                  min="20"
                  max="200"
                  value={width}
                  onChange={(event) => setWidth(Number(event.target.value))}
                />
              </label>
              <label>
                高度 mm
                <input
                  type="number"
                  min="20"
                  max="200"
                  value={height}
                  onChange={(event) => setHeight(Number(event.target.value))}
                />
              </label>
              <label>
                视觉密度
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={complexity}
                  onChange={(event) =>
                    setComplexity(Number(event.target.value))
                  }
                />
                <small>{complexity} / 10</small>
              </label>
              <label>
                模型
                <select
                  value={modelId ?? ""}
                  onChange={(event) => setModelId(event.target.value || null)}
                >
                  <option value="">后台默认</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>
              </div>
              {models.length === 0 && <a className="model-link" href="/admin/models">配置生成模型</a>}
          </section>
        </div>
      )}
    </div>
  );
}

const shell: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "236px minmax(0,1fr) auto",
  background: "#f7f8fa",
  color: U.text,
  fontFamily: "'Outfit', sans-serif",
};
const styles = `.design-sidebar{padding:20px 14px;border-right:1px solid #e7e9ee;background:#fff;display:flex;flex-direction:column;gap:6px}.design-sidebar strong{padding:7px 10px;font-size:15px}.back-control,.new-session,.session-item{border:0;background:transparent;text-align:left;border-radius:8px;padding:10px;color:#52606d;cursor:pointer;font:inherit}.back-control{display:flex;align-items:center;gap:6px;color:#687587;font-size:12px}.new-session{display:flex;gap:7px;align-items:center;background:#eef5ff;color:#1968c9;font-weight:600;margin:8px 0}.session-item{display:grid;gap:3px}.session-item:hover,.session-item.active{background:#f1f3f6;color:#1d2a39}.session-item small{font-size:11px;color:#8b96a4}.design-start{display:grid;place-items:center;padding:42px}.start-inner{width:min(620px,100%)}.start-back{display:none;border:0;background:transparent;padding:0;color:#687587;font:inherit;font-size:12px;align-items:center;gap:6px;cursor:pointer;margin-bottom:15px}.eyebrow{display:flex;align-items:center;gap:7px;color:#2676ce;font-size:12px;font-weight:650}.start-inner h1{font-size:32px;margin:12px 0 8px}.start-inner>p{color:#748091;line-height:1.6}.title-input,.brief,.config-grid input,.config-grid select,.composer textarea{box-sizing:border-box;border:1px solid #dfe4ea;background:#fff;border-radius:8px;font:inherit;color:#263342}.title-input{width:100%;padding:12px;margin:18px 0 10px}.config-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.config-grid label{font-size:12px;color:#687587;display:grid;gap:6px}.config-grid input,.config-grid select{padding:9px}.brief{width:100%;height:126px;margin:18px 0;padding:13px;resize:vertical;line-height:1.55}.upload,.attach{cursor:pointer;display:inline-flex;align-items:center;gap:7px;color:#506071;font-size:13px}.upload input,.attach input{display:none}.start-button{margin-top:18px;width:100%;border:0;border-radius:8px;padding:13px;background:#1968c9;color:#fff;font:inherit;font-weight:650;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}.chat-main{min-width:0;display:flex;flex-direction:column;height:100vh}.chat-main header{padding:18px 28px;border-bottom:1px solid #e5e8ed;background:#fff;display:flex;justify-content:space-between;align-items:center}.chat-main h2{font-size:17px;margin:4px 0 0}.icon-control,.send-button{border:0;background:#eaf3ff;color:#1970cf;border-radius:8px;width:34px;height:34px;display:grid;place-items:center;cursor:pointer}.message-list{padding:28px max(30px,7vw);overflow:auto;flex:1;display:flex;flex-direction:column;gap:20px}.message{display:grid;gap:6px;max-width:760px}.message.user{align-self:flex-end}.message-label{font-size:11px;color:#8390a0}.user .message-label{text-align:right}.bubble{background:#fff;border:1px solid #e6e9ed;border-radius:9px;padding:13px 15px;line-height:1.6;font-size:14px;box-shadow:0 2px 8px #24344b08}.user .bubble{background:#eaf3ff;border-color:#d3e7ff}.bubble small{margin-top:8px;display:flex;gap:6px;align-items:center;color:#788799}.task-line{display:flex;gap:8px;align-items:center;align-self:center;color:#2871c9;font-size:12px}.task-line small{color:#7f8c9a}.composer{padding:12px max(22px,7vw) 22px;background:#fff;border-top:1px solid #e5e8ed}.config-strip{font-size:11px;color:#778496;margin:0 0 8px}.config-strip span{display:inline-block;width:1px;height:11px;background:#d8dde4;margin:0 8px;vertical-align:middle}.composer textarea{width:100%;min-height:72px;padding:12px;resize:none}.compose-actions{display:flex;align-items:center;gap:10px;margin-top:9px}.compose-actions>span{flex:1}.pause-button{border:1px solid #d7dde5;background:#fff;color:#566474;border-radius:7px;padding:7px 10px;display:flex;gap:6px;align-items:center;cursor:pointer;font:inherit;font-size:12px}.preview-panel{width:min(34vw,410px);padding:18px;background:#fff;border-left:1px solid #e5e8ed;display:flex;flex-direction:column;gap:14px}.preview-panel>div:first-child{display:flex;justify-content:space-between;color:#54708b;font-size:13px}.preview-stage{width:100%;background:#eef1f5;display:grid;place-items:center;overflow:hidden;box-shadow:0 12px 30px #22334a18}.preview-panel iframe{width:100%;height:100%;border:0;background:#fff}.preview-panel small{color:#788799;line-height:1.5}.notice{color:#bd3b3b;font-size:12px}.settings-overlay{position:fixed;inset:0;z-index:20;background:#1d2a3940;display:grid;place-items:center;padding:18px}.settings-dialog{position:relative;width:min(440px,100%);background:#fff;border:1px solid #dfe4ea;border-radius:8px;padding:22px;box-shadow:0 16px 45px #24344b26}.settings-dialog .config-grid{margin-top:18px}.settings-close{position:absolute;right:12px;top:12px}@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 1s linear infinite}@media(max-width:900px){.design-sidebar{display:none}.start-back{display:inline-flex}.design-start{grid-column:1/-1}.preview-panel{position:fixed;inset:auto 12px 12px;width:auto;max-height:50vh;box-shadow:0 8px 30px #24344b26}.message-list{padding:20px}.config-grid{grid-template-columns:1fr}.chat-main{grid-column:1/-1}}`;

const responsiveHistoryStyles = `
  .history-toggle { display: none; }
  .history-close { display: none; }
  .model-link { display: inline-flex; margin-top: 8px; color: #1968c9; font-size: 12px; text-decoration: none; }
  @media (max-width: 900px) {
    .history-toggle { display: inline-flex; position: fixed; z-index: 25; top: 14px; right: 14px; align-items: center; gap: 5px; border: 1px solid #dfe4ea; border-radius: 7px; background: #fff; color: #52606d; padding: 7px 9px; font: inherit; font-size: 12px; cursor: pointer; }
    .history-close { display: inline-flex; align-items: center; gap: 5px; align-self: flex-end; border: 0; background: transparent; color: #687587; padding: 6px; font: inherit; font-size: 12px; cursor: pointer; }
    .design-sidebar { display: flex; position: fixed; inset: 0 auto 0 0; width: 236px; box-sizing: border-box; z-index: 30; box-shadow: 8px 0 30px #24344b26; transform: translateX(-105%); transition: transform .2s ease; }
    .history-open .design-sidebar { transform: translateX(0); }
  }
`;
