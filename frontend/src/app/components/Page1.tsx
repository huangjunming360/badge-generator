import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  Upload, Image as ImageIcon, ChevronRight, RefreshCw, Check, X,
  Sparkles, Layers,
} from "lucide-react";
import {
  Field, NavState,
  E, U, SAMPLE,
  usePress, RippleBtn, FIcon,
} from "./shared";
import { fetchSchema, createCardFromText, createCardFromDocument } from "../../api/cards";
import { ModelPicker } from "./ModelPicker";
import UserMenu from "./UserMenu";
import { toFields } from "../../api/fields";
import { ApiError } from "../../api/client";
import type { SchemaFieldDef } from "../../api/types";

/* ── Editable field row ──────────────────────────────────────── */
function EditableFieldRow({ field, onToggle, onChange, onDelete, index }: {
  field: Field; onToggle: () => void;
  onChange: (v: string) => void; onDelete: () => void; index: number;
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
        <span style={{ color: field.selected ? U.blue : U.textLight, flexShrink: 0 }}>
          <FIcon k={field.key} size={12} />
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
      <button onClick={onDelete} style={{
        width: 22, height: 22, borderRadius: 6, border: "none",
        background: "transparent", display: "flex", alignItems: "center",
        justifyContent: "center", cursor: "pointer", color: U.textFaint,
        flexShrink: 0, transition: `color .14s`,
      }}
        onMouseEnter={e => { e.currentTarget.style.color = "#C05060"; }}
        onMouseLeave={e => { e.currentTarget.style.color = U.textFaint; }}>
        <X size={12} />
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

  const [rawText, setRawText] = useState(saved?.rawText ?? SAMPLE);
  const [fields, setFields]   = useState<Field[]>(saved?.fields ?? []);
  const [parsing, setParsing] = useState(false);
  const [streamIdx, setStreamIdx] = useState(
    saved?.fields ? saved.fields.length - 1 : -1
  );
  const [imgName, setImgName]   = useState<string | null>(null);
  // "idle" = centered on screen; "active" = pushed to top (parsing or done)
  const [phase, setPhase]       = useState<"idle" | "active">(
    saved?.fields?.length ? "active" : "idle"
  );
  // 后端 schema：字段清单与中文标签的唯一来源，不在前端写死。
  const [schema, setSchema] = useState<SchemaFieldDef[]>([]);
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
        setModelId(s.models.default);
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
  const runExtraction = useCallback(async (work: () => Promise<{
    fields: Record<string, string | null>; id: number;
  }>) => {
    setPhase("active");
    setParsing(true);
    setError(null);
    setStreamIdx(-1);
    setFields([]);

    try {
      const card = await work();
      const parsed = toFields(card.fields, schema);
      setCardId(card.id);
      setFields(parsed);
      startStream(parsed);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "提取失败，请重试");
      setPhase(fields.length ? "active" : "idle");
    } finally {
      setParsing(false);
    }
  }, [schema, startStream, fields.length]);

  const handleParse = useCallback(() => {
    if (!rawText.trim() || parsing) return;
    runExtraction(() => createCardFromText(rawText, modelId));
  }, [rawText, parsing, runExtraction, modelId]);

  // 文档不再由前端 FileReader 读文本：后端能按扩展名处理
  // docx/pdf/xlsx/csv，扫描件还会自动走 OCR，前端读不了这些。
  const handleFile = useCallback((file: File) => {
    if (parsing) return;
    setRawText(`（已上传文件：${file.name}）`);
    runExtraction(() => createCardFromDocument(file, portraitFile, modelId));
  }, [parsing, runExtraction, portraitFile, modelId]);

  // 证件照只记下来，随下一次建卡一起提交。
  const handleImg = useCallback((file: File) => {
    setImgName(file.name);
    setPortraitFile(file);
  }, []);

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
    navigate("/design", { state: { rawText, fields, cardId } as NavState });
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
        textAlign: "center", flexShrink: 0,
      }}>
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
          <UserMenu />
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
            border: `1px solid ${U.border}`,
            boxShadow: "0 4px 20px rgba(30,50,80,.07), 0 1px 4px rgba(30,50,80,.04)",
            overflow: "hidden",
            transition: `box-shadow .2s ${E.smooth}`,
          }}>
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
                  <span style={{ fontSize: 10, color: U.green, fontWeight: 500 }}>{imgName}</span>
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

          {/* ── Action bar ─────────────────────────────── */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ImportBtn icon={<Upload size={13} />} label="导入文件"
              onClick={() => fileRef.current?.click()} />
            <ImportBtn icon={<ImageIcon size={13} />} label="导入图片"
              onClick={() => imgRef.current?.click()} />
            <input ref={fileRef} type="file" accept=".txt,.csv,.vcf" style={{ display: "none" }}
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <input ref={imgRef} type="file" accept="image/*" style={{ display: "none" }}
              onChange={e => e.target.files?.[0] && handleImg(e.target.files[0])} />

            <div style={{ flex: 1 }} />

            <RippleBtn onClick={handleParse} disabled={!rawText.trim() || parsing} style={{
              display: "flex", alignItems: "center", gap: 7, padding: "9px 22px",
              borderRadius: 9, border: "none",
              cursor: rawText.trim() && !parsing ? "pointer" : "default",
              background: rawText.trim() && !parsing ? U.blue : U.border,
              color: "#fff", fontSize: 13, fontWeight: 600, letterSpacing: ".04em",
              boxShadow: rawText.trim() && !parsing
                ? "0 4px 16px rgba(58,118,196,.38)" : "none",
              transition: `all .2s ${E.smooth}`,
            }}>
              {parsing
                ? <><RefreshCw size={13} style={{ animation: "spin .8s linear infinite" }} /> 解析中…</>
                : <><Sparkles size={13} /> 开始解析</>}
            </RippleBtn>
          </div>

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
                      onChange={v => changeValue(f.key, v)}
                      onDelete={() => deleteField(f.key)} />
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
    </div>
  );
}
