import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  Code2,
  Eye,
  LoaderCircle,
  Maximize2,
  Sparkles,
  Upload,
  WandSparkles,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useNavigate } from "react-router";
import { ApiError } from "../../api/client";
import { fetchSchema } from "../../api/cards";
import {
  applyJob,
  archiveTemplate,
  compareTemplateVersions,
  createAdminTemplate,
  createStudioTemplate,
  enqueueVisualRepair,
  fetchAdminTemplates,
  fetchJob,
  fetchStudioJob,
  fetchStudioTemplates,
  fetchTemplateAgentStatus,
  generateTemplate,
  generateStudioTemplate,
  publishTemplate,
  rollbackTemplate,
  updateAdminTemplate,
  updateStudioTemplate,
  type BadgeTemplate,
  type TemplateAgentStatus,
  type TemplateVersion,
} from "../../api/templates";
import { U } from "./shared";

const sample = {
  name: "林小明",
  name_en: "Xiaoming Lin",
  organization: "北京大学物理学院",
  event_topic: "夏令营",
  portrait_url: "/default-avatar.svg",
};
const liquidSample = (s: string) =>
  s
    .replace(
      /{{\s*card\.([\w_]+)\s*}}/g,
      (_, key) => sample[key as keyof typeof sample] ?? "",
    )
    .replace(
      /{{\s*fields\.([\w_]+)\s*}}/g,
      (_, key) => sample[key as keyof typeof sample] ?? "",
    )
    .replace(/{{\s*assets\.[\w_]+\s*}}/g, sample.portrait_url);

const latestGenerationStorageKey = (studio: boolean) =>
  studio ? "badge-template-studio-generation-job" : "badge-template-admin-generation-job";

export default function AdminTemplateWorkbench({ studio = false }: { studio?: boolean }) {
  const nav = useNavigate();
  const [templates, setTemplates] = useState<BadgeTemplate[]>([]);
  const [selected, setSelected] = useState<BadgeTemplate | null>(null);
  const [name, setName] = useState("夏令营模板");
  const [widthMm, setWidthMm] = useState(55);
  const [heightMm, setHeightMm] = useState(85);
  const [widthInput, setWidthInput] = useState("55");
  const [heightInput, setHeightInput] = useState("85");
  const [html, setHtml] = useState(
    '<article class="badge"><img class="portrait" src="{{ card.portrait_url }}" alt=""><div class="content"><p class="eyebrow">{{ card.event_topic }}</p><h1>{{ card.name }}</h1><p class="organization">{{ card.organization }}</p></div></article>',
  );
  const [css, setCss] = useState(
    '.badge { height: 100%; max-height: 100%; overflow: hidden; box-sizing: border-box; padding: 9mm; display: grid; grid-template-columns: 23mm minmax(0, 1fr); gap: 6mm; align-items: center; color: #17283b; font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; } .portrait { width: 23mm; height: 23mm; border-radius: 50%; object-fit: cover; } .content { min-width: 0; } .eyebrow { margin: 0 0 2mm; font-size: 3mm; color: #54718d; } h1 { margin: 0; font-size: clamp(6mm, 9vw, 10mm); line-height: 1.1; overflow-wrap: anywhere; } .organization { margin: 3mm 0 0; font-size: 3.8mm; line-height: 1.45; overflow-wrap: anywhere; }',
  );
  const [requirement, setRequirement] = useState("炫酷但适合打印的夏令营名牌");
  const [complexity, setComplexity] = useState(6);
  const [referenceAssets, setReferenceAssets] = useState<File[]>([]);
  const [diagnostics, setDiagnostics] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [generationJobId, setGenerationJobId] = useState<number | null>(null);
  const [generationStatus, setGenerationStatus] = useState<string | null>(null);
  const [generationStage, setGenerationStage] = useState<string | null>(null);
  const [generationMessage, setGenerationMessage] = useState("");
  const [canvasPreviewReady, setCanvasPreviewReady] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [agentStatus, setAgentStatus] = useState<TemplateAgentStatus | null>(null);
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<number | null>(null);
  const [comparison, setComparison] = useState<{
    base: TemplateVersion;
    target: TemplateVersion;
    changed: { html: boolean; css: boolean };
  } | null>(null);
  const refresh = () =>
    (studio ? fetchStudioTemplates() : fetchAdminTemplates())
      .then((list) => {
        setTemplates(list);
        return list;
      })
      .catch((e) => {
        setMessage(e.message);
        return [];
      });
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    const rawJobId = window.sessionStorage.getItem(latestGenerationStorageKey(studio));
    const storedJobId = Number(rawJobId);
    if (!Number.isSafeInteger(storedJobId) || storedJobId <= 0) return;

    let alive = true;
    (studio ? fetchStudioJob(storedJobId) : fetchJob(storedJobId))
      .then((job) => {
        if (!alive) return;
        setGenerationJobId(storedJobId);
        setGenerationStatus(job.status);
        setGenerationStage(job.stage ?? "");
        setGenerationMessage(job.stage_message ?? "");
        if (["succeeded", "waiting_for_visual_review"].includes(job.status) && job.result?.html) {
          setHtml(job.result.html);
          setCss(job.result.css);
          setMessage(
            job.status === "succeeded"
              ? "已恢复最近完成的设计草案"
              : "已恢复最近的 AI 草案，当前等待视觉节点",
          );
        }
        if (["failed", "cancelled"].includes(job.status)) {
          window.sessionStorage.removeItem(latestGenerationStorageKey(studio));
        }
      })
      .catch(() => window.sessionStorage.removeItem(latestGenerationStorageKey(studio)));
    return () => {
      alive = false;
    };
  }, [studio]);
  useEffect(() => {
    if (studio) return;
    let alive = true;
    const load = () =>
      fetchTemplateAgentStatus()
        .then((status) => alive && setAgentStatus(status))
        .catch(() => alive && setAgentStatus(null));
    load();
    const timer = window.setInterval(load, 15_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [studio]);
  useEffect(() => {
    let alive = true;
    fetchSchema()
      .then((schema) => {
        if (!alive) return;
        const available = schema.models.available;
        setModels(available);
        setModelId(
          available.some((model) => model.id === schema.models.default)
            ? schema.models.default
            : (available[0]?.id ?? null),
        );
      })
      .catch(() => {
        if (alive) setMessage("无法读取可用模型，生成将使用后台默认模型");
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const v = selected?.versions?.[0];
    if (selected && v) {
      setName(selected.name);
      setWidthMm(selected.width_mm);
      setHeightMm(selected.height_mm);
      setWidthInput(String(selected.width_mm));
      setHeightInput(String(selected.height_mm));
      setHtml(v.source_html ?? "");
      setCss(v.source_css ?? "");
    }
  }, [selected]);
  useEffect(() => {
    setCanvasPreviewReady(false);
  }, [html, css]);
  useEffect(() => {
    if (!jobId || !["queued", "leased"].includes(jobStatus ?? "")) return;
    const timer = window.setInterval(
      () =>
        (studio ? fetchStudioJob(jobId) : fetchJob(jobId))
          .then((job) => {
            setJobStatus(job.status);
            if (job.status === "succeeded")
              setMessage("视觉修复已完成，请检查结果后应用");
            if (job.status === "failed")
              setMessage(job.error_message ?? "视觉修复失败");
          })
          .catch((e) => setMessage(e.message)),
      5000,
    );
    return () => window.clearInterval(timer);
  }, [jobId, jobStatus]);
  useEffect(() => {
    if (
      !generationJobId ||
      !["queued", "leased", "waiting_for_visual_review"].includes(generationStatus ?? "")
    )
      return;
    const timer = window.setInterval(
      () =>
        (studio ? fetchStudioJob(generationJobId) : fetchJob(generationJobId))
          .then((job) => {
            setGenerationStatus(job.status);
            setGenerationStage(job.stage ?? "");
            setGenerationMessage(job.stage_message ?? "");
            if (["succeeded", "waiting_for_visual_review"].includes(job.status) && job.result?.html) {
              setHtml(job.result.html);
              setCss(job.result.css);
              setMessage(
                job.status === "succeeded"
                  ? "设计草案已完成，请检查画布；你可以继续提出修改要求"
                  : "AI 草案已生成，当前等待视觉节点；你仍可先检查画布或继续修改需求",
              );
            }
            if (job.status === "failed")
              setMessage(job.error_message ?? "设计任务失败");
          })
          .catch((e) => setMessage(e.message)),
      1200,
    );
    return () => window.clearInterval(timer);
  }, [generationJobId, generationStatus]);
  const preview = useMemo(
    () => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'"><style>
    html,body{margin:0;padding:0;width:100vw;height:100vh;overflow:hidden;box-sizing:border-box}
    body{background:#fff}
    ${css}
    html,body{width:100vw !important;height:100vh !important;min-width:0 !important;min-height:0 !important;overflow:hidden !important}
    #badge-preview-root{position:fixed;inset:0;overflow:hidden;box-sizing:border-box}
    #badge-preview-root>*:first-child{box-sizing:border-box;max-width:100%;max-height:100%;overflow:hidden}
  </style></head><body><div id="badge-preview-root">${liquidSample(html)}</div></body></html>`,
    [html, css],
  );
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      const t = selected
        ? await (studio ? updateStudioTemplate : updateAdminTemplate)(selected.id, {
            name,
            width_mm: widthMm,
            height_mm: heightMm,
            html,
            css,
            generation_job_id: generationJobId ?? undefined,
          })
        : await (studio ? createStudioTemplate : createAdminTemplate)({
            name,
            orientation: "portrait",
            width_mm: widthMm,
            height_mm: heightMm,
            html,
            css,
            generation_job_id: generationJobId ?? undefined,
          });
      setSelected(t);
      refresh();
      setMessage("已保存草稿");
    });
  const generate = () =>
    run(async () => {
      const context = [
        `成品尺寸：${widthMm}mm × ${heightMm}mm（比例 ${(widthMm / heightMm).toFixed(3)}）。`,
        "请把尺寸用于估算头像区、姓名区、单位区等文字空间；每个字段都必须拥有可伸缩边界、最大行数、字号范围及长文本溢出策略。",
        referenceAssets.length > 0
          ? `已附 ${referenceAssets.length} 张参考素材。可借鉴其色彩、纹理和视觉语言，但不要复制版式，也不要把素材中的文字当作模板内容。`
          : "没有参考素材，请从需求本身建立视觉语言。",
        html.trim() ? `当前草案 HTML:\n${html}\n当前草案 CSS:\n${css}` : "暂无当前草案，请从零开始设计。",
      ].join("\n\n");
      const job = await (studio ? generateStudioTemplate : generateTemplate)(
        requirement,
        complexity,
        context,
        modelId,
        widthMm,
        heightMm,
        referenceAssets,
      );
      setGenerationJobId(job.id);
      setGenerationStatus(job.status);
      setGenerationStage(job.stage);
      setGenerationMessage(job.stage_message ?? "任务已创建");
      window.sessionStorage.setItem(latestGenerationStorageKey(studio), String(job.id));
      setMessage("设计任务已启动，正在分阶段处理");
    });
  const repair = () => {
    const version = selected?.versions?.[0];
    if (!selected || !version) return;
    return run(async () => {
      const job = await enqueueVisualRepair(
        selected.id,
        version.id,
        diagnostics,
        requirement,
        complexity,
      );
      setJobId(job.id);
      setJobStatus(job.status);
      setMessage(`已排队任务 #${job.id}，节点完成后可应用结果`);
    });
  };
  const applyRepair = () =>
    jobId &&
    run(async () => {
      const version = await applyJob(jobId);
      setHtml(version.source_html ?? html);
      setCss(version.source_css ?? css);
      setJobStatus("applied");
      refresh();
      setMessage("修复已应用为新草稿版本");
    });
  const publish = () => {
    const version = selected?.versions?.[0];
    if (!selected || !version) return;
    return run(async () => {
      await publishTemplate(selected.id, version.id);
      refresh();
      setMessage("已发布当前版本");
    });
  };
  const archive = () =>
    selected &&
    run(async () => {
      const updated = await archiveTemplate(selected.id);
      setSelected(updated);
      refresh();
      setMessage("模板已归档，不会再提供给普通用户");
    });
  const compareVersions = () => {
    const current = selected?.versions?.[0];
    if (!selected || !current || !compareVersionId) return;
    return run(async () => {
      const result = await compareTemplateVersions(
        selected.id,
        compareVersionId,
        current.id,
      );
      setComparison(result);
      setMessage(
        result.changed.html || result.changed.css
          ? "所选历史版本与当前版本存在差异"
          : "所选历史版本与当前版本相同",
      );
    });
  };
  const rollback = () => {
    if (!selected || !compareVersionId) return;
    return run(async () => {
      const version = await rollbackTemplate(selected.id, compareVersionId);
      setHtml(version.source_html ?? html);
      setCss(version.source_css ?? css);
      const list = await refresh();
      setSelected(
        list.find((template) => template.id === selected.id) ?? selected,
      );
      setComparison(null);
      setMessage("已从历史版本创建新的草稿，尚未发布");
    });
  };

  return (
    <div
      style={{
        height: "100vh",
        overflow: "hidden",
        background: U.bg,
        color: U.text,
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      <style>{workbenchStyles}</style>
      <header
        style={{
          height: 58,
          borderBottom: `1px solid ${U.border}`,
          background: U.surface,
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "0 24px",
        }}
      >
        <button
          title="返回"
          aria-label="返回"
          onClick={() => nav("/")}
          style={{
            border: 0,
            background: "transparent",
            cursor: "pointer",
            color: U.textMid,
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <strong>{studio ? "我的模板" : "模板工作台"}</strong>
        <span style={{ color: U.textFaint, fontSize: 12 }}>
          {studio ? "设计、预览与私有草稿" : "设计、预览、视觉检查与版本发布"}
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={save} disabled={busy} style={primary}>
          {busy ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <Check size={14} />
          )}{" "}
          保存草稿
        </button>
      </header>
      <main
        className="template-workbench-main"
        style={{
          display: "grid",
          gridTemplateColumns: "220px minmax(360px, 1fr) minmax(280px, 38vw)",
          gap: 0,
          height: "calc(100vh - 58px)",
          minHeight: 0,
        }}
      >
        <aside
          style={{
            borderRight: `1px solid ${U.border}`,
            padding: 18,
            background: U.surface,
          }}
        >
          <button
            onClick={() => {
              setSelected(null);
              setName("夏令营模板");
              setWidthMm(55);
              setHeightMm(85);
              setWidthInput("55");
              setHeightInput("85");
            }}
            style={secondary}
          >
            + 新建模板
          </button>
          <div style={{ marginTop: 20, fontSize: 11, color: U.textFaint }}>
            {studio ? "我的私有模板" : "我的模板"}
          </div>
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              style={{
                ...listItem,
                color: selected?.id === t.id ? U.blue : U.textMid,
                background:
                  selected?.id === t.id ? U.blueXLight : "transparent",
              }}
            >
              {t.name}
              <small>{t.status}</small>
            </button>
          ))}
        </aside>
        <section style={{ padding: 24, minWidth: 0, overflow: "auto" }}>
          <label style={label}>
            模板名称
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={input}
            />
          </label>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginTop: 8,
            }}
          >
            <label style={label}>
              宽度（mm）
              <input
                type="number"
                min="20"
                max="200"
                value={widthInput}
                onChange={(e) => setWidthInput(e.target.value)}
                onBlur={() => {
                  const value = Math.max(20, Math.min(200, Number(widthInput) || 55));
                  setWidthMm(value);
                  setWidthInput(String(value));
                }}
                style={input}
              />
            </label>
            <label style={label}>
              高度（mm）
              <input
                type="number"
                min="20"
                max="200"
                value={heightInput}
                onChange={(e) => setHeightInput(e.target.value)}
                onBlur={() => {
                  const value = Math.max(20, Math.min(200, Number(heightInput) || 85));
                  setHeightMm(value);
                  setHeightInput(String(value));
                }}
                style={input}
              />
            </label>
          </div>
          <div className="canvas-heading">
            <div><Eye size={15} /><strong>设计画布</strong><span>示例数据 · {widthMm} × {heightMm} mm</span></div>
            <div className="canvas-tools">
              <button title="缩小" aria-label="缩小" onClick={() => setCanvasZoom((z) => Math.max(0.65, z - 0.1))}><ZoomOut size={15} /></button>
              <button title="适配画布" aria-label="适配画布" onClick={() => setCanvasZoom(1)}><Maximize2 size={15} /></button>
              <button title="放大" aria-label="放大" onClick={() => setCanvasZoom((z) => Math.min(1.35, z + 0.1))}><ZoomIn size={15} /></button>
            </div>
          </div>
          <div
            className="canvas-stage"
          >
            <div className="canvas-ruler">成品 {widthMm} mm × {heightMm} mm · {Math.round(canvasZoom * 100)}%</div>
            <div
              className="badge-canvas"
              style={{
                width: Math.min(390, 360 * (widthMm / heightMm)),
                maxWidth: "100%",
                aspectRatio: `${widthMm} / ${heightMm}`,
                transform: `scale(${canvasZoom})`,
              }}
            >
              <iframe title="设计画布预览" sandbox="allow-same-origin" onLoad={() => setCanvasPreviewReady(true)} srcDoc={preview} />
              {!canvasPreviewReady && <div className="canvas-loading">画布加载中…</div>}
            </div>
          </div>
          <details style={{ marginTop: 22 }}>
            <summary
              style={{
                cursor: "pointer",
                color: U.textMid,
                fontSize: 12,
                userSelect: "none",
              }}
            >
              <Code2
                size={14}
                style={{ verticalAlign: "middle", marginRight: 6 }}
              />
              高级设置：编辑源码
            </summary>
            <div style={{ paddingTop: 12 }}>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  margin: "8px 0 10px",
                  alignItems: "center",
                }}
              >
                <strong>HTML</strong>
              </div>
              <textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                style={editor}
              />
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  margin: "18px 0 10px",
                  alignItems: "center",
                }}
              >
                <strong>CSS</strong>
              </div>
              <textarea
                value={css}
                onChange={(e) => setCss(e.target.value)}
                style={{ ...editor, minHeight: 170 }}
              />
            </div>
          </details>
        </section>
        <aside
          style={{
            borderLeft: `1px solid ${U.border}`,
            background: U.surface,
            padding: 20,
            overflow: "auto",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Check size={16} />
            <strong>安全检查</strong>
          </div>
          <div style={{ marginTop: 8, color: U.textFaint, fontSize: 11, lineHeight: 1.6 }}>
            主画布就是唯一预览。{studio ? "保存草稿后会先做安全和可渲染性检查。" : agentStatus?.ready ? "保存草稿后会由视觉节点检查脚本、外链、溢出和可渲染性。" : agentStatus?.connected ? "视觉节点已连接但仍在准备，当前只会做基础安全检查。" : "当前节点未连接，只会做基础安全检查；视觉节点连接后才会检查溢出和可渲染性。"}
          </div>
          <div
            style={{
              marginTop: 18,
              borderTop: `1px solid ${U.border}`,
              paddingTop: 16,
            }}
          >
            <label style={label}>
              生成模型
              <select
                value={modelId ?? ""}
                disabled={busy || models.length === 0}
                onChange={(e) => setModelId(e.target.value || null)}
                style={{ ...input, cursor: busy ? "not-allowed" : "pointer" }}
              >
                {models.length === 0 ? (
                  <option>后台默认模型</option>
                ) : (
                  models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))
                )}
              </select>
              <span
                style={{
                  display: "block",
                  marginTop: 4,
                  color: U.textFaint,
                  fontSize: 10,
                }}
              >
                模型由后台权限与配置控制
              </span>
            </label>
            <div style={label}>
              设计需求
              <textarea
                value={requirement}
                onChange={(e) => setRequirement(e.target.value)}
                style={{ ...input, minHeight: 70 }}
              />
            </div>
            <label style={label}>
              参考素材（可选）
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(e) => setReferenceAssets(Array.from(e.target.files ?? []).slice(0, 4))}
                style={{ ...input, padding: "7px 8px" }}
              />
              <span style={{ display: "block", marginTop: 4, color: U.textFaint, fontSize: 10 }}>
                {referenceAssets.length > 0
                  ? `已选择 ${referenceAssets.length} 张素材；AI 只借鉴风格，不会锁死版式。`
                  : "最多 4 张 PNG/JPEG/WebP，每张不超过 8MB；AI 只借鉴风格，不会锁死版式。"}
              </span>
            </label>
            <div style={label}>
              <span>视觉密度</span>
              <div className="density-picker">
                {[{ value: 3, label: "清爽" }, { value: 6, label: "平衡" }, { value: 9, label: "炫酷" }].map((option) => (
                  <button key={option.value} className={complexity === option.value ? "selected" : ""} onClick={() => setComplexity(option.value)}>{option.label}</button>
                ))}
              </div>
              <span style={{ display: "block", marginTop: 5, color: U.textFaint, fontSize: 10 }}>
                控制装饰层次，不会改变字段可用空间和可读性约束
              </span>
            </div>
            {!studio && (
              <div className={`agent-status ${agentStatus?.ready ? "online" : "offline"}`}>
                <span className="status-dot" />
                <div>
                  <strong>{agentStatus?.ready ? `${agentStatus.node?.name ?? "视觉节点"} 已就绪` : agentStatus?.connected ? `${agentStatus.node?.name ?? "视觉节点"} 正在准备` : "视觉节点未连接"}</strong>
                  <span>{agentStatus?.ready ? "生成后的草案会自动进行隔离视觉检查" : agentStatus?.connected ? "等待 MAI 或隔离渲染器就绪后再处理视觉检查" : "当前只会生成草案；连接家中节点后才会执行自动视觉检查"}</span>
                </div>
              </div>
            )}
            <button onClick={generate} disabled={busy} style={secondary}>
              <Sparkles size={14} />{" "}
              {["queued", "leased", "waiting_for_visual_review"].includes(generationStatus ?? "")
                ? "继续设计中…"
                : html.trim()
                  ? "继续优化当前草案"
                  : "开始设计草案"}
            </button>
            {generationStage && (
              <div
                style={{
                  marginTop: 9,
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: U.bg,
                  color: U.textMid,
                  fontSize: 11,
                }}
              >
                阶段：
                {(
                  {
                    understanding: "理解需求",
                  generating: "生成视觉草案",
                  validating: "安全检查",
                    visual_review: agentStatus?.ready ? "隔离视觉检查" : "等待视觉节点就绪",
                  review_ready: "等待审核",
                  } as Record<string, string>
                )[generationStage] ?? generationStage}
                <br />
                <span style={{ color: U.textFaint }}>{generationMessage}</span>
              </div>
            )}
          </div>
          {!studio && selected && (
            <div
              style={{
                marginTop: 18,
                borderTop: `1px solid ${U.border}`,
                paddingTop: 16,
              }}
            >
              <label style={label}>
                视觉诊断
                <textarea
                  value={diagnostics}
                  onChange={(e) => setDiagnostics(e.target.value)}
                  placeholder="例如：底部文字溢出、姓名与头像重叠"
                  style={{ ...input, minHeight: 62 }}
                />
              </label>
              <button onClick={repair} disabled={busy} style={secondary}>
                <WandSparkles size={14} /> 提交节点修复
              </button>
              {jobStatus && (
                <div style={{ fontSize: 11, color: U.textMid, marginTop: 8 }}>
                  任务 #{jobId}：
                  {jobStatus === "queued"
                    ? "等待节点"
                    : jobStatus === "leased"
                      ? "节点处理中"
                      : jobStatus === "succeeded"
                        ? "已完成"
                        : jobStatus}
                </div>
              )}
              {jobStatus === "succeeded" && (
                <button
                  onClick={applyRepair}
                  disabled={busy}
                  style={{ ...secondary, marginTop: 8 }}
                >
                  <Check size={14} /> 应用修复为新版本
                </button>
              )}
              <button
                onClick={publish}
                disabled={busy}
                style={{ ...secondary, marginTop: 8 }}
              >
                <Upload size={14} /> 发布当前版本
              </button>
              <button
                onClick={archive}
                disabled={busy}
                style={{ ...secondary, marginTop: 8 }}
              >
                归档模板
              </button>
              <details style={{ marginTop: 12 }}>
                <summary
                  style={{ cursor: "pointer", color: U.textMid, fontSize: 12 }}
                >
                  版本记录（{selected.versions?.length ?? 0}）
                </summary>
                <div style={{ paddingTop: 10 }}>
                  <label style={label}>
                    选择历史版本
                    <select
                      value={compareVersionId ?? ""}
                      onChange={(e) =>
                        setCompareVersionId(
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      style={input}
                    >
                      <option value="">请选择</option>
                      {selected.versions?.slice(1).map((version) => (
                        <option key={version.id} value={version.id}>
                          v{version.version} · {version.source_kind}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={compareVersions}
                    disabled={busy || !compareVersionId}
                    style={secondary}
                  >
                    与当前版本对比
                  </button>
                  <button
                    onClick={rollback}
                    disabled={busy || !compareVersionId}
                    style={{ ...secondary, marginTop: 8 }}
                  >
                    恢复为新的草稿
                  </button>
                  {comparison && (
                    <div
                      style={{ marginTop: 8, color: U.textFaint, fontSize: 11 }}
                    >
                      HTML：{comparison.changed.html ? "有变化" : "相同"} ·
                      CSS：{comparison.changed.css ? "有变化" : "相同"}
                    </div>
                  )}
                </div>
              </details>
            </div>
          )}
          <div
            style={{
              minHeight: 24,
              marginTop: 14,
              color: message.includes("失败") ? "#a33" : U.textMid,
              fontSize: 12,
            }}
          >
            {message}
          </div>
        </aside>
      </main>
    </div>
  );
}

const label: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: U.textMid,
  marginBottom: 12,
};
const input: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: "9px 10px",
  border: `1px solid ${U.border}`,
  borderRadius: 6,
  background: U.bg,
  color: U.text,
  boxSizing: "border-box",
  font: "inherit",
};
const editor: React.CSSProperties = {
  width: "100%",
  minHeight: 250,
  resize: "vertical",
  padding: 14,
  border: `1px solid ${U.border}`,
  borderRadius: 6,
  background: "#102033",
  color: "#dcecff",
  font: "12px/1.6 ui-monospace, monospace",
  boxSizing: "border-box",
};
const primary: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  border: 0,
  borderRadius: 6,
  padding: "8px 13px",
  background: U.blue,
  color: "#fff",
  cursor: "pointer",
};
const secondary: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  width: "100%",
  border: `1px solid ${U.border}`,
  borderRadius: 6,
  padding: "8px 10px",
  background: U.surface,
  color: U.textMid,
  cursor: "pointer",
  fontSize: 12,
};
const listItem: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  width: "100%",
  border: 0,
  borderRadius: 6,
  padding: "9px 8px",
  marginTop: 4,
  cursor: "pointer",
  fontSize: 12,
  textAlign: "left",
};
const workbenchStyles = `
  .template-workbench-main > aside:first-child { overflow: auto; }
  .canvas-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin:18px 0 10px; }
  .canvas-heading > div:first-child { display:flex; align-items:center; gap:8px; }
  .canvas-heading span { font-size:11px; color:${U.textFaint}; }
  .canvas-tools { display:flex; gap:4px; }
  .canvas-tools button { display:grid; place-items:center; width:30px; height:30px; border:1px solid ${U.border}; border-radius:6px; background:${U.surface}; color:${U.textMid}; cursor:pointer; }
  .canvas-tools button:hover, .field-palette button:hover { border-color:${U.blue}; color:${U.blue}; }
  .field-palette { display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
  .field-palette > span { display:flex; align-items:center; gap:5px; margin-right:3px; color:${U.textFaint}; font-size:11px; }
  .field-palette button, .density-picker button { display:flex; align-items:center; gap:4px; border:1px solid ${U.border}; border-radius:5px; padding:6px 8px; background:${U.surface}; color:${U.textMid}; cursor:pointer; font-size:11px; }
  .field-palette button.selected, .density-picker button.selected { border-color:${U.blue}; color:${U.blue}; background:${U.blueXLight}; }
  .canvas-stage { position:relative; min-height:430px; overflow:hidden; border:1px solid ${U.border}; border-radius:8px; background:linear-gradient(90deg, rgba(40,70,100,.035) 1px, transparent 1px), linear-gradient(rgba(40,70,100,.035) 1px, transparent 1px), #f5f7fa; background-size:20px 20px; display:grid; place-items:center; padding:40px 24px 48px; }
  .canvas-ruler { position:absolute; top:10px; left:12px; color:${U.textFaint}; font-size:10px; letter-spacing:.02em; }
  .badge-canvas { transition:transform .18s ease; transform-origin:center center; }
  .badge-canvas iframe { display:block; width:100%; height:100%; aspect-ratio:inherit; border:1px solid ${U.border}; background:#fff; box-shadow:0 12px 30px rgba(20,35,55,.15); }
  .canvas-loading { position:absolute; inset:0; display:grid; place-items:center; color:${U.textFaint}; font-size:12px; background:#fff; }
  .density-picker { display:flex; gap:5px; margin-top:6px; }
  .density-picker button { flex:1; justify-content:center; }
  .agent-status { display:flex; gap:9px; align-items:flex-start; margin:2px 0 12px; padding:10px; border:1px solid ${U.border}; border-radius:7px; background:${U.bg}; }
  .agent-status strong, .agent-status span { display:block; }
  .agent-status strong { font-size:11px; color:${U.textMid}; }
  .agent-status span { margin-top:3px; font-size:10px; line-height:1.45; color:${U.textFaint}; }
  .status-dot { width:8px; height:8px; flex:0 0 auto; margin-top:3px; border-radius:50%; background:#c3cbd3; }
  .agent-status.online { border-color:#a8d9c0; background:#f3fbf6; }
  .agent-status.online .status-dot { background:#2a9b61; box-shadow:0 0 0 3px rgba(42,155,97,.12); }
  @media (max-width: 980px) {
    .template-workbench-main { grid-template-columns: 180px minmax(300px, 1fr) 300px !important; }
  }
  @media (max-width: 760px) {
    .template-workbench-main { display: flex !important; flex-direction: column; height: auto !important; min-height: calc(100vh - 58px); overflow: auto; }
    .template-workbench-main > aside:first-child { flex: 0 0 auto; max-height: 170px; border-right: 0 !important; border-bottom: 1px solid ${U.border}; }
    .template-workbench-main > section { flex: 0 0 auto; min-height: 620px; padding: 18px !important; }
    .template-workbench-main > aside:last-child { flex: 0 0 auto; min-height: 760px; border-left: 0 !important; border-top: 1px solid ${U.border}; }
  }
`;
