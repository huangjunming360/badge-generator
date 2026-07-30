import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  Upload, Image as ImageIcon, ChevronRight, RefreshCw, Check, X, FileText,
  Sparkles, Layers, Settings, GripVertical,
} from "lucide-react";
import {
  Field, NavState,
  E, U,
  usePress, RippleBtn, FIcon,
} from "./shared";
import { fetchSchema, pollCard, fetchCard, uploadPortrait } from "../../api/cards";
import { ModelPicker } from "./ModelPicker";
import UserMenu from "./UserMenu";
import CropModal from "./CropModal";
import { toFields, toAiFields } from "../../api/fields";
import { ApiError } from "../../api/client";
import type { SchemaFieldDef, SchemaPayload } from "../../api/types";

/* ── Editable field row ──────────────────────────────────────── */
function EditableFieldRow({ field, onToggle, onChange, index }: {
  field: Field; onToggle: () => void;
  onChange: (v: string) => void; index: number;
}) {
  const { hovered, bind } = usePress();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px", borderRadius: 10,
      border: `1px solid ${field.selected ? U.blue + "55" : hovered ? U.border : U.borderLight}`,
      background: field.selected ? U.blueXLight : U.surface,
      animation: `fadeSlideIn .28s ${E.smooth} ${index * 70}ms both`,
      transition: `border .18s ${E.smooth}, background .18s ${E.smooth}, box-shadow .2s ${E.smooth}`,
      boxShadow: field.selected ? "0 2px 12px rgba(58,118,196,.12)" : "none",
    }} {...bind}>
      <button onClick={onToggle} style={{
        width: 18, height: 18, borderRadius: 5, flexShrink: 0,
        border: field.selected ? "none" : `1.5px solid ${U.textFaint}`,
        background: field.selected ? U.blue : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", transition: `all .16s ${E.spring}`,
      }}>
        {field.selected && <Check size={10} color="#fff" strokeWidth={3} />}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 5, width: 72, flexShrink: 0 }}>
        <span style={{ color: field.selected ? U.blue : U.textLight, flexShrink: 0, fontSize: 12 }}>
          {field.icon ? <i className={`${["fa-linkedin", "fa-github", "fa-twitter"].includes(field.icon) ? "fa-brands" : "fas"} ${field.icon}`} /> : <FIcon k={field.key} size={12} />}
        </span>
        <span style={{ fontSize: 11, color: field.selected ? U.blue : U.textMid, fontWeight: 500, whiteSpace: "nowrap" }}>
          {field.label}
        </span>
      </div>
      <input value={field.value} onChange={e => onChange(e.target.value)}
        style={{
          flex: 1, border: "none", background: "transparent",
          fontSize: 12.5, color: U.text, fontFamily: "'Outfit',sans-serif",
          outline: "none", fontWeight: 500,
          borderBottom: "1.5px solid transparent", paddingBottom: 1,
          transition: `border-color .16s`,
        }}
        onFocus={e => { e.target.style.borderBottomColor = U.blue; }}
        onBlur={e =>  { e.target.style.borderBottomColor = "transparent"; }}
      />
      <button title="拖拽排序" style={{
        width: 22, height: 22, borderRadius: 6, border: "none",
        background: "transparent", display: "flex", alignItems: "center",
        justifyContent: "center", cursor: "grab", color: U.textFaint,
        flexShrink: 0, transition: `color .14s`,
      }}
        onMouseEnter={e => { e.currentTarget.style.color = "#C05060"; }}
        onMouseLeave={e => { e.currentTarget.style.color = U.textFaint; }}>
        <GripVertical size={12} />
      </button>
    </div>
  );
}

/* ── Ghost import button ─────────────────────────────────────── */
function ImportBtn({ icon, label, onClick }: {
  icon: React.ReactNode; label: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
      borderRadius: 9, border: `1px solid ${U.border}`, background: U.surface,
      cursor: "pointer", fontSize: 12, color: U.textMid,
      transition: `all .16s ${E.smooth}`,
    }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = U.blue + "66";
        e.currentTarget.style.color = U.blue;
        e.currentTarget.style.background = U.surfaceBlue;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = U.border;
        e.currentTarget.style.color = U.textMid;
        e.currentTarget.style.background = U.surface;
      }}>
      {icon}{label}
    </button>
  );
}

/* ── Page 1 ──────────────────────────────────────────────────── */
export default function Page1() {
  const navigate = useNavigate();
  const location = useLocation();
  const saved    = location.state as NavState | null;

  // 清除 history.state 防止 F5 后旧数据还在
  useEffect(() => {
    if (location.state) window.history.replaceState({}, "", location.pathname);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [rawText, setRawText] = useState(saved?.rawText ?? "");
  const [fields, setFields]   = useState<Field[]>(saved?.fields ?? []);
  const [parsing, setParsing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [progressStage, setProgressStage] = useState<string | null>(null);
  const [streamIdx, setStreamIdx] = useState(
    saved?.fields ? saved.fields.length - 1 : -1
  );
  const [imgName, setImgName]   = useState<string | null>(saved?.imgName ?? null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(saved?.portraitUrl ?? null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const originalFileRef = useRef<File | null>(null);
  const croppedRef = useRef(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  // "idle" = centered on screen; "active" = pushed to top (parsing or done)
  const [phase, setPhase]       = useState<"idle" | "active">(
    saved?.fields?.length ? "active" : "idle"
  );
  // 后端 schema：字段清单与中文标签的唯一来源，不在前端写死。
  const [schema, setSchema] = useState<SchemaFieldDef[]>([]);
  const [uploadCfg, setUploadCfg] = useState<{ allowed_extensions: string[]; max_bytes: number } | null>(null);
  const [mineruCfg, setMineruCfg] = useState<{ available: boolean; portrait_detect: boolean } | null>(null);
  const [mineruEnabled, setMineruEnabled] = useState(true);
  const [portraitDetect, setPortraitDetect] = useState(true);
  const [showMineruOpts, setShowMineruOpts] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  // 建卡后的 id，供第二页读取与后续更新。
  const [cardId, setCardId] = useState<number | null>(saved?.cardId ?? null);
  // 证件照留在本页，随建卡请求一起上传。
  const [portraitFile, setPortraitFile] = useState<File | null>(null);
  // 模型选择：分离架构下随请求参数发给后端，不走 cookie session。
  const [models, setModels] = useState<{ id: string; label: string }[]>([]);
  const [modelId, setModelId] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const imgRef      = useRef<HTMLInputElement>(null);

  /* Auto-resize textarea — single line → expands with content */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 420) + "px";
  }, [rawText]);

  /* 拉取后端 schema。字段清单与中文标签都以后端为准。 */
  useEffect(() => {
    let alive = true;
    fetchSchema()
      .then(s => {
        if (!alive) return;
        setSchema(s.fields);
        setModels(s.models.available);
        const def = s.models.default;
        setModelId(s.models.available.some(m => m.id === def) ? def : s.models.available[0]?.id ?? null);
        if (s.upload) setUploadCfg(s.upload);
        if (s.mineru) { setMineruCfg(s.mineru); setMineruEnabled(s.mineru.available); }
      })
      .catch(e => { if (alive) setError(e instanceof ApiError ? e.message : "无法读取字段配置"); });
    return () => { alive = false; };
  }, []);

  const startStream = useCallback((parsed: Field[]) => {
    let i = 0;
    const tick = () => {
      setStreamIdx(i);
      i++;
      if (i < parsed.length) setTimeout(tick, 85);
    };
    setTimeout(tick, 60);
  }, []);

  /* 提取统一走后端 LLM。此前的本地正则解析已删除 ——
     两套逻辑会对同一份资料给出不同结果。 */
  const runExtraction = useCallback(async (params: {
    rawInput?: string; file?: File; portrait?: File | null; modelId?: string | null;
  }) => {
    setPhase("active");
    setParsing(true);
    setError(null);
    setStreamIdx(-1);
    setFields([]);
    // 用户手动上传的照片在解析期间保留预览，不清掉
    if (!portraitFile) {
      setPortraitUrl(null);
      setImgName(null);
    }
    setProgressMsg("提交中…");
    setProgressStage("uploading");

    try {
      const cardId = await pollCard(params, (p) => {
        setProgressMsg(p.message);
        setProgressStage(p.stage);
      });
      const card = await fetchCard(cardId);
      const parsed = card.ai_fields?.length
        ? toAiFields(card.ai_fields)
        : toFields(card.fields, schema);
      setCardId(card.id);
      setFields(parsed);
      // 证件照：后端已按"手动上传优先于自动识别"处理，
      // 所以 card.portrait 就是最终要用的那张。
      if (card.portrait) {
        const url = card.portrait.url;
        setPortraitUrl(url);
        // 用户手动上传了照片 → 解析完成后上传替换自动识别的
        if (portraitFile && cardId) {
          uploadPortrait(cardId, portraitFile).then(c => {
            setPortraitUrl(c.portrait?.url ?? url);
            setImgName("📷 已上传照片");
          }).catch(() => {});
        } else {
          setImgName("📷 原始照片");
        }
        // 保存自动识别的照片作为原始底稿（供切换/裁切用）
        if (!originalFileRef.current && !url.startsWith("blob:")) {
          fetch(url).then(r => r.blob()).then(blob => {
            originalFileRef.current = new File([blob], "portrait-original.jpg", { type: blob.type });
          }).catch(() => {});
        }
      }
      startStream(parsed);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "提取失败，请重试");
      setFields(prev => { setPhase(prev.length ? "active" : "idle"); return prev; });
    } finally {
      setParsing(false);
      setProgressMsg(null);
      setProgressStage(null);
    }
  }, [schema, startStream, portraitFile]);

  const handleParse = useCallback(() => {
    if (parsing) return;
    const opts = { mineru_enabled: mineruEnabled, portrait_detect: portraitDetect, portrait: portraitFile };
    if (pendingFile) {
      runExtraction({ file: pendingFile, modelId, ...opts });
    } else if (rawText.trim()) {
      runExtraction({ rawInput: rawText, modelId, ...opts });
    }
  }, [rawText, parsing, runExtraction, modelId, pendingFile, portraitFile, mineruEnabled, portraitDetect]);

  // 上传文件仅暂存，用户点击「提取」后再发送给后端
  const handleFile = useCallback((file: File) => {
    if (parsing) return;
    setPendingFile(file);
    setPhase("active");
  }, [parsing]);

  // 证件照只记下来，随下一次建卡一起提交。
  const handleImg = useCallback((file: File) => {
    setImgName("📷 已上传照片");
    setPortraitFile(file);
    croppedRef.current = false;
    // 原始照片（文档识别那张）不清，留在 originalFileRef 里供切换用
    // 已有 card → 立即上传替换
    if (cardId) {
      uploadPortrait(cardId, file).then(card => {
        setPortraitUrl(card.portrait?.url ?? null);
      }).catch(() => {
        setPortraitUrl(URL.createObjectURL(file));
      });
    } else {
      setPortraitUrl(URL.createObjectURL(file));
    }
  }, [cardId]);

  const toggleField  = (key: string) => setFields(p => p.map(f => f.key === key ? { ...f, selected: !f.selected } : f));
  const changeValue  = (key: string, v: string) => setFields(p => p.map(f => f.key === key ? { ...f, value: v } : f));
  // 后端是固定 schema，字段删不掉。这里的语义是清空值并取消勾选，
  // 字段留在列表里但不出现在挂牌上。
  const deleteField  = (key: string) =>
    setFields(p => p.map(f => f.key === key ? { ...f, value: "", selected: false } : f));

  const hasFields     = fields.length > 0;
  const hasSelected   = fields.some(f => f.selected);
  const selectedCount = fields.filter(f => f.selected).length;
  const isStreaming   = hasFields && streamIdx < fields.length - 1;

  const { hovered: goHov, pressed: goPre, bind: goBind } = usePress();

  const goToDesign = () => {
    navigate("/design", { state: { rawText, fields, cardId, portraitUrl, imgName } as NavState });
  };

  /* Padding-top drives the centering ↔ top animation */
  const contentPaddingTop = phase === "active" ? "28px" : "calc(50vh - 180px)";

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      fontFamily: "'Outfit',sans-serif", color: U.text, overflow: "hidden",
      background: U.bg,
    }}>

      {/* ── Header ─────────────────────────────────────── */}
      <div style={{
        background: U.blueDark, padding: "18px 0 16px",
        textAlign: "center", flexShrink: 0, position: "relative",
      }}>
        <div style={{ position: "absolute", top: 12, right: 16, zIndex: 1 }}>
          <UserMenu dark />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 4 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: "rgba(255,255,255,.13)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Layers size={17} color="#fff" />
          </div>
          <div style={{
            fontFamily: "'Playfair Display',serif", fontSize: 21, fontWeight: 700,
            color: "#fff", letterSpacing: ".05em",
          }}>
            名牌生成器
          </div>
        </div>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,.38)", letterSpacing: ".26em" }}>
          BADGE GENERATOR
        </div>

        {/* 模型选择与历史入口 */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 16, marginTop: 12,
        }}>
          <ModelPicker
            models={models}
            value={modelId}
            onChange={setModelId}
            disabled={parsing}
          />
          <button onClick={() => navigate("/history")} style={{
            border: "1px solid rgba(255,255,255,.22)", background: "rgba(255,255,255,.12)",
            color: "#fff", fontSize: 11, padding: "4px 11px", borderRadius: 7,
            cursor: "pointer", fontFamily: "'Outfit',sans-serif",
            transition: `all .16s ${E.smooth}`,
          }}>
            历史记录
          </button>
        </div>
      </div>

      {/* 提取失败必须显式告知：静默失败会让用户以为资料没问题 */}
      {error && (
        <div style={{
          padding: "8px 20px", background: "#FDF0F2", borderBottom: "1px solid #F0D4DA",
          fontSize: 11.5, color: "#8A3448", display: "flex", alignItems: "center", gap: 8,
          flexShrink: 0,
        }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{
            border: "none", background: "transparent", cursor: "pointer",
            color: "#8A3448", fontSize: 11.5, padding: "2px 6px",
          }}>关闭</button>
        </div>
      )}

      {/* ── Scrollable content ─────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{
          maxWidth: 640, width: "100%", margin: "0 auto",
          paddingTop: contentPaddingTop,
          paddingLeft: "20px", paddingRight: "20px", paddingBottom: "140px",
          boxSizing: "border-box",
          transition: `padding-top .58s ${E.smooth}`,
          display: "flex", flexDirection: "column", gap: 14,
        }}>

          {/* Welcome hint — fades out once active */}
          <div style={{
            textAlign: "center",
            maxHeight: phase === "idle" ? "48px" : "0px",
            opacity: phase === "idle" ? 1 : 0,
            overflow: "hidden",
            transition: `opacity .35s ${E.smooth}, max-height .5s ${E.smooth}`,
            pointerEvents: "none",
            marginBottom: phase === "idle" ? 6 : 0,
          }}>
            <div style={{ fontSize: 12, color: U.textLight, letterSpacing: ".04em" }}>
              粘贴参加者信息或 JSON 数据
            </div>
          </div>

          {/* ── Input card ─────────────────────────────── */}
          <div style={{
            background: U.surface, borderRadius: 14,
            border: `1px solid ${dragging ? U.blue : U.border}`,
            boxShadow: dragging ? "0 0 0 3px rgba(58,118,196,.15)" : "0 4px 20px rgba(30,50,80,.07), 0 1px 4px rgba(30,50,80,.04)",
            overflow: "hidden",
            transition: `border-color .15s ${E.smooth}, box-shadow .15s ${E.smooth}`,
            position: "relative",
          }}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={e => { e.preventDefault(); setDragging(false); }}
            onDrop={e => {
              e.preventDefault(); setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f && !parsing) { handleFile(f); }
            }}>
            {dragging && (
              <div style={{
                position: "absolute", inset: 0, zIndex: 10,
                background: `${U.blue}11`, borderRadius: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, color: U.blue, fontWeight: 500, gap: 8,
                backdropFilter: "blur(2px)",
              }}>
                <Upload size={16} /> 松开以上传文件
              </div>
            )}
            {/* Card header bar */}
            <div style={{
              padding: "11px 16px 10px", borderBottom: `1px solid ${U.borderLight}`,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: rawText.trim() ? U.blue : U.textFaint,
                transition: `background .3s ${E.smooth}`,
              }} />
              <span style={{ fontSize: 11.5, color: U.textMid, fontWeight: 500 }}>
                参加者资料
              </span>
              {imgName && (
                <div style={{
                  marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
                  padding: "3px 9px", borderRadius: 99,
                  background: U.greenLight, border: `1px solid ${U.green}44`,
                  animation: `fadeSlideIn .2s ${E.smooth} both`,
                }}>
                  <ImageIcon size={10} color={U.green} />
                  <span style={{ fontSize: 10, color: U.green, fontWeight: 500 }}>{imgName?.replace("📷 ", "")}</span>
                  <button onClick={() => {
                    if (portraitUrl) setCropSrc(portraitUrl);
                    else if (portraitFile) setCropSrc(URL.createObjectURL(portraitFile));
                  }} style={{ background: "none", border: "none", cursor: "pointer",
                    color: U.blue, padding: 0, fontSize: 10, lineHeight: 1 }} title="裁切">✂</button>
                  <button onClick={() => { setImgName(null); setPortraitFile(null); setPortraitUrl(null); }}
                    style={{ background: "none", border: "none", cursor: "pointer",
                      color: U.green, padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
                </div>
              )}
            </div>

            {/* Textarea — starts single-line, expands with content */}
            <textarea
              ref={textareaRef}
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder="姓名 · 机构 · 项目主题…"
              style={{
                width: "100%", border: "none", outline: "none",
                padding: "14px 16px", resize: "none", overflow: "hidden",
                minHeight: "52px",
                boxSizing: "border-box",
                fontFamily: "'Outfit',sans-serif",
                fontSize: 13.5, color: U.text, lineHeight: 1.85,
                background: "transparent",
                transition: `min-height .2s ${E.smooth}`,
              }}
            />
          </div>

          {/* ── 已上传文件 ──────────────────────────────── */}
          {pendingFile && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 4px 0",
              fontSize: 12, color: U.textMid,
            }}>
              <FileText size={13} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {pendingFile.name}
              </span>
              <button onClick={() => setPendingFile(null)} style={{
                background: "none", border: "none", cursor: "pointer",
                color: U.textFaint, padding: 2, fontSize: 14, lineHeight: 1,
              }}>×</button>
            </div>
          )}

          {/* ── 解析进度 ───────────────────────────────── */}
          {parsing && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12, padding: "8px 0",
              fontSize: 12, color: U.textMid,
            }}>
              <div style={{ flex: 1, display: "flex", gap: 4 }}>
                {[
                  { key: "uploading", label: "提交" },
                  { key: "mineru", label: "解析" },
                  { key: "portrait", label: "人像" },
                  { key: "extracting", label: "提取" },
                  { key: "done", label: "完成" },
                ].map((s, i) => {
                  const stages = ["uploading", "mineru", "portrait", "extracting", "done"];
                  const idx = stages.indexOf(progressStage || "uploading");
                  return (
                    <div key={i} style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: i <= idx ? U.blue : U.borderLight,
                      transition: `background .4s ${E.smooth}`,
                    }} />
                  );
                })}
              </div>
              <span style={{ whiteSpace: "nowrap", fontSize: 11 }}>{progressMsg || "解析中…"}</span>
            </div>
          )}

          {/* ── Action bar ─────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ImportBtn icon={<Upload size={13} />} label="导入文件"
              onClick={() => fileRef.current?.click()} />
            <ImportBtn icon={<ImageIcon size={13} />} label="导入图片"
              onClick={() => imgRef.current?.click()} />
            <input ref={fileRef} type="file" accept={uploadCfg?.allowed_extensions?.join(",") || ".txt,.csv,.vcf"} style={{ display: "none" }}
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <input ref={imgRef} type="file" accept={uploadCfg?.allowed_extensions?.filter(e => [".png",".jpg",".jpeg",".bmp",".tiff",".webp"].includes(e)).join(",") || "image/*"} style={{ display: "none" }}
              onChange={e => e.target.files?.[0] && handleImg(e.target.files[0])} />

            {mineruCfg?.available && !!pendingFile && (
              <div style={{ position: "relative" }}>
                <button onClick={() => setShowMineruOpts(v => !v)} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 10px", borderRadius: 8, border: `1px solid ${U.border}`,
                  background: showMineruOpts ? U.surfaceBlue : "transparent",
                  cursor: "pointer", fontSize: 11, color: U.textMid,
                  transition: `all .15s ${E.smooth}`,
                }}>
                  <Layers size={12} /> 识别
                </button>
                {showMineruOpts && (
                  <div style={{
                    position: "absolute", right: 0, top: "100%", marginTop: 4, zIndex: 100,
                    width: 140, background: "#fff", borderRadius: 8,
                    border: `1px solid ${U.border}`, boxShadow: "0 4px 16px rgba(0,0,0,.08)",
                    padding: "4px 6px", fontSize: 10.5,
                  }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 0", cursor: "pointer" }}>
                      <input type="checkbox" checked={mineruEnabled} onChange={e => setMineruEnabled(e.target.checked)}
                             style={{ width: 14, height: 14, cursor: "pointer" }} />
                      <span style={{ color: U.textMid }}>文档解析</span>
                    </label>
                    {mineruEnabled && (
                      <label style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 0", cursor: "pointer" }}>
                        <input type="checkbox" checked={portraitDetect} onChange={e => setPortraitDetect(e.target.checked)}
                               style={{ width: 14, height: 14, cursor: "pointer" }} />
                        <span style={{ color: U.textMid }}>人像识别</span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ flex: 1 }} />

            <RippleBtn onClick={handleParse} disabled={(!rawText.trim() && !pendingFile) || parsing} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "9px 22px",
              borderRadius: 9, border: "none",
              cursor: (!rawText.trim() && !pendingFile) || parsing ? "default" : "pointer",
              background: (!rawText.trim() && !pendingFile) || parsing ? U.border : U.blue,
              color: "#fff", fontSize: 13, fontWeight: 600, letterSpacing: ".04em",
              boxShadow: (!rawText.trim() && !pendingFile) || parsing
                ? "none" : "0 4px 16px rgba(58,118,196,.38)",
              transition: `all .2s ${E.smooth}`,
            }}>
              {parsing
                ? <><RefreshCw size={13} style={{ animation: "spin .8s linear infinite" }} /> 解析中…</>
                : <><Sparkles size={13} /> 开始解析</>}
            </RippleBtn>
          </div>

          {/* ── 证件照预览 ──────────────────────────────── */}
          {portraitUrl && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 0 0",
              animation: `fadeSlideIn .3s ${E.smooth} both`,
            }}>
              <img src={portraitUrl} alt="证件照"
                style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover",
                  border: `2px solid ${U.green}44`, boxShadow: "0 2px 8px rgba(0,0,0,.06)" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: U.green }}>
                  {portraitFile ? "已上传照片" : "已识别到证件照"}
                </div>
                <div style={{ fontSize: 11, color: U.textLight, marginTop: 2 }}>{imgName?.replace("📷 ", "")}</div>
              </div>
              <button onClick={async () => {
                // 还没存原图就拉一次
                if (!originalFileRef.current && portraitUrl && !portraitUrl.startsWith("blob:")) {
                  try {
                    const res = await fetch(portraitUrl);
                    const blob = await res.blob();
                    originalFileRef.current = new File([blob], "portrait-original.jpg", { type: blob.type });
                  } catch {}
                }
                // 裁切总是从原始图片开始
                const orig = originalFileRef.current;
                setCropSrc(orig ? URL.createObjectURL(orig) : portraitUrl);
              }} style={{
                padding: "3px 8px", borderRadius: 6, border: `1px solid ${U.border}`,
                background: "transparent", cursor: "pointer", fontSize: 10, color: U.textMid,
              }}>裁切</button>
              {originalFileRef.current && portraitFile && (
                <button onClick={async () => {
                  const orig = originalFileRef.current!;
                  if (cardId) {
                    const card = await uploadPortrait(cardId, orig).catch(() => null);
                    setPortraitUrl(card?.portrait?.url ?? URL.createObjectURL(orig));
                  } else {
                    setPortraitUrl(URL.createObjectURL(orig));
                  }
                  setPortraitFile(null);
                  setImgName("📷 原始照片");
                  croppedRef.current = false;
                }} style={{
                  padding: "3px 8px", borderRadius: 6, border: `1px solid ${U.border}`,
                  background: "transparent", cursor: "pointer", fontSize: 10, color: U.textMid,
                }}>切换至文档</button>
              )}
            </div>
          )}

          {/* ── AI result section ───────────────────────── */}
          {hasFields && (
            <div style={{ animation: `fadeSlideIn .3s ${E.smooth} both` }}>
              <div style={{
                display: "flex", alignItems: "center",
                justifyContent: "space-between", marginBottom: 13,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 8, background: U.blueLight,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Sparkles size={13} color={U.blue} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: U.text, lineHeight: 1 }}>
                      AI 解析结果
                    </div>
                    <div style={{ fontSize: 10, color: U.textFaint, marginTop: 3 }}>
                      可直接编辑 · 点击勾选显示字段
                    </div>
                  </div>
                  <div style={{
                    padding: "3px 9px", borderRadius: 99,
                    background: U.blueXLight, border: `1px solid ${U.blueLight}`,
                    fontSize: 10.5, color: U.blue, fontWeight: 500,
                  }}>
                    {selectedCount}/{fields.length} 已选
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[
                    { label: "全选", fn: () => setFields(p => p.map(f => ({ ...f, selected: true }))) },
                    { label: "清空", fn: () => setFields(p => p.map(f => ({ ...f, selected: false }))) },
                  ].map(b => (
                    <button key={b.label} onClick={b.fn} style={{
                      fontSize: 11, color: U.textMid, background: "none",
                      border: `1px solid ${U.border}`, padding: "4px 11px",
                      borderRadius: 7, cursor: "pointer", transition: `all .14s ${E.smooth}`,
                    }}
                      onMouseEnter={e => { e.currentTarget.style.color = U.blue; e.currentTarget.style.borderColor = U.blue + "66"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = U.textMid; e.currentTarget.style.borderColor = U.border; }}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {fields.map((f, i) =>
                  i <= streamIdx ? (
                    <EditableFieldRow key={f.key} field={f} index={i}
                      onToggle={() => toggleField(f.key)}
                      onChange={v => changeValue(f.key, v)} />
                  ) : null
                )}
              </div>

              {/* Streaming indicator */}
              {isStreaming && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 4px", opacity: .5 }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: 5, height: 5, borderRadius: "50%", background: U.blue,
                        animation: `dotBounce .9s ${E.smooth} ${i * 0.18}s infinite`,
                      }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 11, color: U.textMid }}>正在识别字段…</span>
                </div>
              )}
            </div>
          )}

          {/* Empty prompt in active state (no results yet) */}
          {phase === "active" && !hasFields && !parsing && (
            <div style={{ textAlign: "center", padding: "32px 0", opacity: .35 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16, background: U.blueXLight,
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 12px",
              }}>
                <Sparkles size={24} color={U.blue} />
              </div>
              <div style={{ fontSize: 13, color: U.textMid }}>点击「开始解析」识别字段</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Sticky bottom CTA ──────────────────────────── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 30,
        background: U.surface, borderTop: `1px solid ${U.border}`,
        padding: "14px 32px 20px",
        boxShadow: "0 -8px 32px rgba(20,35,55,.09)",
        transform: hasSelected ? "translateY(0)" : "translateY(110%)",
        transition: `transform .4s ${E.spring}`,
        willChange: "transform",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
      }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: U.text }}>
            已选 {selectedCount} 个字段
          </div>
          <div style={{ fontSize: 11, color: U.textLight, marginTop: 2 }}>
            确认字段后进入名牌设计
          </div>
        </div>
        <RippleBtn onClick={goToDesign} {...goBind} style={{
          display: "flex", alignItems: "center", gap: 9, padding: "12px 28px",
          borderRadius: 11, border: "none", cursor: "pointer",
          background: `linear-gradient(135deg, ${U.blue} 0%, ${U.blueDark} 100%)`,
          color: "#fff", fontSize: 13.5, fontWeight: 600, letterSpacing: ".05em",
          boxShadow: goPre
            ? "0 2px 8px rgba(58,118,196,.3)"
            : goHov
              ? "0 8px 28px rgba(58,118,196,.5)"
              : "0 5px 20px rgba(58,118,196,.38)",
          transform: `scale(${goPre ? 0.96 : goHov ? 1.02 : 1})`,
          transition: `transform .14s ${E.snappy}, box-shadow .2s ${E.smooth}`,
          willChange: "transform", whiteSpace: "nowrap",
        }}>
          开始设计 <ChevronRight size={16} />
        </RippleBtn>
      </div>

      {/* ── Crop Modal ─────────────────────────────────── */}
      {cropSrc && (
        <CropModal src={cropSrc} open={!!cropSrc}
          onClose={() => { setCropSrc(null); }}
          onCrop={async (blob, fullScreen) => {
            setCropSrc(null);
            // 全屏 = 恢复原始照片。上传之前保存的原文件。
            const orig = originalFileRef.current;
            if (fullScreen && orig) {
              setPortraitFile(orig);
              croppedRef.current = false;
              setImgName("📷 原始照片");
              if (cardId) {
                const card = await uploadPortrait(cardId, orig).catch(() => null);
                setPortraitUrl(card?.portrait?.url ?? URL.createObjectURL(orig));
              } else {
                setPortraitUrl(URL.createObjectURL(orig));
              }
              return;
            }
            const file = new File([blob], "portrait-cropped.jpg", { type: "image/jpeg" });
            setPortraitFile(file);
            croppedRef.current = !fullScreen;
            setImgName(fullScreen ? "📷 原始照片" : "📷 已裁切");
            // 已有 card → 立即上传，拿到真实 URL
            if (cardId) {
              uploadPortrait(cardId, file).then(card => {
                const url = card.portrait?.url ?? null;
                setPortraitUrl(url);
                if (url && !url.startsWith("blob:") && !originalFileRef.current) {
                  fetch(url).then(r => r.blob()).then(blob => {
                    originalFileRef.current = new File([blob], "portrait-original.jpg", { type: blob.type });
                  }).catch(() => {});
                }
              }).catch(() => {
                setPortraitUrl(URL.createObjectURL(file));
              });
            } else {
              setPortraitUrl(URL.createObjectURL(file));
            }
          }}
        />
      )}
    </div>
  );
}
