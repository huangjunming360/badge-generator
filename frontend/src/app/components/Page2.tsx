import { useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { ArrowLeft, Eye, Check, SlidersHorizontal } from "lucide-react";
import {
  Field, Template, AccentKey, FontSz, StyleKey, CustomCfg, NavState,
  E, U, ACCENTS,
  BadgeCard, PreviewSheet, OptionsSidebar, FIcon, RippleBtn,
} from "./shared";

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

  const toggleField   = (key: string) => setFields(p => p.map(f => f.key===key ? {...f,selected:!f.selected} : f));
  const selectedCount = fields.filter(f => f.selected).length;

  const goBack = () => {
    navigate("/", { state: { rawText: saved?.rawText ?? "", fields } satisfies NavState });
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
              <BadgeCard {...badgeProps} scale={1.28}/>
            </div>

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
