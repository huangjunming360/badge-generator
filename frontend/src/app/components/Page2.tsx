import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router";
import { ArrowLeft, Eye, Check, SlidersHorizontal } from "lucide-react";
import {
  Field, Template, AccentKey, FontSz, StyleKey, CustomCfg, NavState,
  E, U, ACCENTS,
  BadgeCard, PreviewSheet, OptionsSidebar, FIcon, RippleBtn,
} from "./shared";
import { BadgeCanvas, templateContentSize, canvasSizeMm } from "./BadgeCanvas";
import { SizeControls } from "./SizeControls";
import { fetchCard, fetchSchema, updateCardSize } from "../../api/cards";
import { toFields } from "../../api/fields";
import { ApiError } from "../../api/client";

export default function Page2() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const saved     = location.state as NavState | null;

  const [fields, setFields]     = useState<Field[]>(saved?.fields ?? []);
  const [template, setTemplate] = useState<Template>("visitor");
  const [accent, setAccent]     = useState<AccentKey>("rose");
  const [fontSize, setFontSize] = useState<FontSz>("md");
  const [styleK, setStyleK]     = useState<StyleKey>("minimal");
  const [custom, setCustom]     = useState<CustomCfg>({
    orientation:"portrait", showPhoto:true, showQR:true,
    showBarcode:false, showDots:false, headerLabel:"", subLabel:"",
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [optPanelOpen, setOptPanelOpen] = useState(true);

  const [cardId] = useState<number | null>(saved?.cardId ?? null);
  // 实物尺寸以后端为准（默认 55×85mm）。刷新丢了 state 时用后端默认值兜底。
  const [sizeMm, setSizeMm] = useState({ widthMm: 55, heightMm: 85 });
  const [previewScale, setPreviewScale] = useState(1);
  // 尺寸边界与缩放档位来自后端 schema，不在前端写死。
  const [limits, setLimits] = useState({
    minMm: 20, maxMm: 200, defaultWidthMm: 55, defaultHeightMm: 85,
    scales: [ 1, 1.5, 2, 3 ],
  });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // 刷新会丢 location.state。有 cardId 就回源重取，保证刷新不丢数据。
  useEffect(() => {
    if (!cardId) return;
    let alive = true;

    Promise.all([fetchCard(cardId), fetchSchema()])
      .then(([card, schema]) => {
        if (!alive) return;
        setSizeMm({ widthMm: card.width_mm, heightMm: card.height_mm });
        setPreviewScale(schema.preview.default_scale);
        setLimits({
          minMm: schema.size.min_mm,
          maxMm: schema.size.max_mm,
          defaultWidthMm: schema.size.default_width_mm,
          defaultHeightMm: schema.size.default_height_mm,
          scales: schema.preview.scales,
        });
        // 没有从上一页带过来字段时（直接刷新本页），用后端数据填充。
        if (!saved?.fields?.length) setFields(toFields(card.fields, schema.fields));
      })
      .catch(e => { if (alive) setError(e instanceof ApiError ? e.message : "读取失败"); });

    return () => { alive = false; };
  }, [cardId, saved?.fields?.length]);

  // 尺寸落库。勾选/配色/字号是纯展示配置不入库，
  // 但 mm 尺寸决定印出来多大，必须持久化。
  const persistSize = async (widthMm: number, heightMm: number) => {
    setSizeMm({ widthMm, heightMm });
    if (!cardId) return;
    setSaveState("saving");
    setError(null);
    try {
      await updateCardSize(cardId, widthMm, heightMm);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      setError(e instanceof ApiError ? e.message : "保存尺寸失败");
    }
  };

  const toggleField   = (key: string) => setFields(p => p.map(f => f.key===key ? {...f,selected:!f.selected} : f));
  const selectedCount = fields.filter(f => f.selected).length;

  const goBack = () => {
    navigate("/", { state: { rawText: saved?.rawText ?? "", fields, cardId } satisfies NavState });
  };

  const badgeProps = { fields, template, accent, fontSize, styleK, custom };

  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column",
      fontFamily:"'Outfit',sans-serif", overflow:"hidden", background:U.bg, color:U.text }}>

      {/* ── Top bar ────────────────────────────────────── */}
      <div style={{ height:52, background:U.surface, borderBottom:`1px solid ${U.border}`,
        display:"flex", alignItems:"center", padding:"0 20px", gap:12, flexShrink:0,
        boxShadow:"0 1px 8px rgba(30,50,80,.05)" }}>

        <button onClick={goBack} style={{
          display:"flex", alignItems:"center", gap:5, padding:"6px 13px",
          borderRadius:8, border:`1px solid ${U.border}`,
          background:U.bg, cursor:"pointer", fontSize:12, color:U.textMid,
          transition:`all .16s ${E.smooth}`,
        }}
          onMouseEnter={e => { e.currentTarget.style.color=U.blue; e.currentTarget.style.borderColor=U.blue+"55"; e.currentTarget.style.background=U.blueXLight; }}
          onMouseLeave={e => { e.currentTarget.style.color=U.textMid; e.currentTarget.style.borderColor=U.border; e.currentTarget.style.background=U.bg; }}>
          <ArrowLeft size={13}/> 返回修改
        </button>

        <div style={{ width:1, height:20, background:U.border }}/>

        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, fontWeight:600, color:U.text }}>
          工牌设计
        </div>
        <div style={{ fontSize:11, color:U.textFaint }}>/</div>
        <div style={{ fontSize:11, color:U.textMid }}>
          {{ visitor:"访客通行证", access:"员工通行证", business:"名片", custom:"自定义" }[template]}
          {" · "}{ACCENTS[accent].label}
        </div>

        <div style={{ flex:1 }}/>

        {/* Options toggle */}
        <button onClick={() => setOptPanelOpen(v => !v)} style={{
          display:"flex", alignItems:"center", gap:6, padding:"6px 13px",
          borderRadius:8, border:`1px solid ${optPanelOpen ? U.blue+"55" : U.border}`,
          background:optPanelOpen ? U.blueXLight : U.bg,
          cursor:"pointer", fontSize:12, color:optPanelOpen ? U.blue : U.textMid,
          transition:`all .18s ${E.smooth}`,
        }}>
          <SlidersHorizontal size={13}/> 样式选项
        </button>

        {/* Preview button */}
        <button onClick={() => setSheetOpen(true)} style={{
          display:"flex", alignItems:"center", gap:6, padding:"7px 16px",
          borderRadius:8, border:`1px solid ${U.blue}44`,
          background:U.blueXLight, cursor:"pointer", fontSize:12, color:U.blue, fontWeight:500,
          transition:`all .16s ${E.smooth}`,
        }}
          onMouseEnter={e => { e.currentTarget.style.background=U.blueLight; e.currentTarget.style.boxShadow="0 3px 12px rgba(58,118,196,.22)"; }}
          onMouseLeave={e => { e.currentTarget.style.background=U.blueXLight; e.currentTarget.style.boxShadow="none"; }}>
          <Eye size={13}/> 预览成品
        </button>
      </div>

      {/* 错误必须让用户看到，否则保存失败会静默丢改动 */}
      {error && (
        <div style={{
          padding:"8px 20px", background:"#FDF0F2", borderBottom:"1px solid #F0D4DA",
          fontSize:11.5, color:"#8A3448", display:"flex", alignItems:"center", gap:8,
        }}>
          <span style={{ flex:1 }}>{error}</span>
          <button onClick={() => setError(null)} style={{
            border:"none", background:"transparent", cursor:"pointer", color:"#8A3448",
            fontSize:11.5, padding:"2px 6px",
          }}>关闭</button>
        </div>
      )}

      {/* ── Main area ──────────────────────────────────── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* Preview stage */}
        <div style={{ flex:1, display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center",
          position:"relative", overflow:"hidden", padding:"32px 24px" }}>

          {/* Dot grid background */}
          <svg style={{ position:"absolute", inset:0, width:"100%", height:"100%",
            opacity:.16, pointerEvents:"none" }}>
            <defs>
              <pattern id="dot-grid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.3" fill={U.blue}/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#dot-grid)"/>
          </svg>

          {/* Badge preview */}
          <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column",
            alignItems:"center", gap:28 }}>
            <div style={{ animation:`floatIn .5s ${E.spring} both`,
              filter:"drop-shadow(0 16px 40px rgba(30,50,80,.13))" }}>
              {/* 外层是 mm 实物画布，内容等比缩放居中。设计稿模板是像素比例
                  （竖版 2:3），与 55:85 不等，包一层才不会拉伸变形。 */}
              <BadgeCanvas
                {...canvasSizeMm(sizeMm.widthMm, sizeMm.heightMm, template, custom.orientation)}
                contentWidth={templateContentSize(template, custom.orientation).width}
                contentHeight={templateContentSize(template, custom.orientation).height}
                previewScale={previewScale}
              >
                <BadgeCard {...badgeProps} scale={1}/>
              </BadgeCanvas>
            </div>

            {/* 实物尺寸与预览缩放 */}
            <SizeControls
              widthMm={sizeMm.widthMm}
              heightMm={sizeMm.heightMm}
              minMm={limits.minMm}
              maxMm={limits.maxMm}
              defaultWidthMm={limits.defaultWidthMm}
              defaultHeightMm={limits.defaultHeightMm}
              previewScale={previewScale}
              scales={limits.scales}
              saveState={saveState}
              onCommitSize={persistSize}
              onPreviewScale={setPreviewScale}
            />

            {/* Field chips row */}
            {fields.length > 0 && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
                <div style={{ display:"flex", flexWrap:"wrap", gap:7, justifyContent:"center", maxWidth:520 }}>
                  {fields.map(f => {
                    const on = f.selected;
                    return (
                      <button key={f.key} onClick={() => toggleField(f.key)} style={{
                        display:"flex", alignItems:"center", gap:5,
                        padding:"5px 12px 5px 9px", borderRadius:99, cursor:"pointer",
                        border:`1px solid ${on ? U.blue+"66" : U.border}`,
                        background:on ? U.blueXLight : U.surface,
                        color:on ? U.blue : U.textMid, fontSize:11,
                        transform:`scale(${on ? 1 : 0.98})`,
                        boxShadow:on ? "0 2px 8px rgba(58,118,196,.15)" : "none",
                        transition:`all .16s ${E.smooth}`,
                      }}>
                        <span style={{ color:on ? U.blue : U.textFaint, lineHeight:0 }}>
                          <FIcon k={f.key} size={10}/>
                        </span>
                        <span>{f.label}</span>
                        {on && <Check size={9} color={U.blue} strokeWidth={2.5}/>}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize:10.5, color:U.textFaint }}>
                  点击字段芯片可切换在工牌上的显示 · 已显示 {selectedCount} 个字段
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Options sidebar ─────────────────────────── */}
        <div style={{
          width: optPanelOpen ? 300 : 0,
          minWidth: optPanelOpen ? 300 : 0,
          overflow:"hidden",
          transition:`width .32s ${E.smooth}, min-width .32s ${E.smooth}`,
          willChange:"width",
        }}>
          <div style={{ width:300, height:"100%", background:U.surface,
            borderLeft:`1px solid ${U.border}`, overflow:"auto" }}>
            <div style={{ padding:"20px 18px 32px" }}>
              <OptionsSidebar
                template={template}   setTemplate={setTemplate}
                accent={accent}       setAccent={setAccent}
                fontSize={fontSize}   setFontSize={setFontSize}
                styleK={styleK}       setStyleK={setStyleK}
                custom={custom}       setCustom={setCustom}
                onExport={() => { /* export logic */ }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Preview sheet */}
      <PreviewSheet open={sheetOpen} onClose={() => setSheetOpen(false)} {...badgeProps}/>
    </div>
  );
}
