import { useState, useRef, useEffect } from "react";
import {
  User, Phone, Mail, Building2, Hash, Calendar, MapPin,
  Shield, Check, Download, Layers, AlignLeft, Eye, X,
  Type, Palette, Layout, SlidersHorizontal, Sliders,
  Minimize2, Maximize2, Image as ImageIcon, QrCode, BarChart2, Columns,
  BookOpen, Users, Bookmark,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────── */
export interface Field {
  id: string; key: string; label: string; value: string;
  selected: boolean; category: "person" | "contact" | "access";
}
export type Template  = "visitor" | "access" | "business" | "custom";
export type AccentKey = "rose" | "blue" | "gold";
export type FontSz    = "sm" | "md" | "lg";
export type StyleKey  = "minimal" | "formal";
export interface CustomCfg {
  orientation: "portrait" | "landscape";
  showPhoto: boolean; showQR: boolean;
  showBarcode: boolean; showDots: boolean;
  headerLabel: string; subLabel: string;
}
export interface NavState {
  rawText: string;
  fields: Field[];
  cardId: number | null;
  portraitUrl?: string | null;
  imgName?: string | null;
}

/* ── Easing ─────────────────────────────────────────────────── */
export const E = {
  spring: "cubic-bezier(0.34, 1.28, 0.64, 1)",
  smooth: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  snappy: "cubic-bezier(0.4, 0, 0.2, 1)",
  bounce: "cubic-bezier(0.68, -0.55, 0.27, 1.55)",
};

/* ── Palette ─────────────────────────────────────────────────── */
export const U = {
  bg:          "#F4F7FB",
  surface:     "#FFFFFF",
  surfaceWarm: "#FDFBF7",
  surfaceBlue: "#EEF4FC",
  blue:        "#3A76C4",
  blueDark:    "#1D4F8A",
  blueLight:   "#D8E9F8",
  blueXLight:  "#EDF4FD",
  border:      "#D8E5F2",
  borderLight: "#E8EFF8",
  text:        "#1A2C40",
  textMid:     "#4E718A",
  textLight:   "#8AAABB",
  textFaint:   "#B8CCDA",
  green:       "#3CB371",
  greenLight:  "#E8F5EE",
};

/* ── Badge accents ───────────────────────────────────────────── */
export const ACCENTS: Record<AccentKey, { main:string; deep:string; muted:string; label:string; desc:string }> = {
  rose: { main:"#B86478", deep:"#7A3448", muted:"#F0D4DA", label:"玫瑰红", desc:"温柔优雅" },
  blue: { main:"#3A76C4", deep:"#1D4F8A", muted:"#D8E9F8", label:"靛青蓝", desc:"沉稳专业" },
  gold: { main:"#9A7840", deep:"#6A5020", muted:"#EEE0C4", label:"暖砂金", desc:"低调精致" },
};

/* ── Sample data ─────────────────────────────────────────────── */
export const SAMPLE = `{
  "名称": "林思远",
  "组织项目的机构": "清华大学",
  "组织项目的机构部门": "人工智能研究院",
  "项目主题": "2026 · 暑期 AI 研修营"
}`;

/* Field descriptor used by both JSON and line parsers */
/* 本地解析已删除：提取统一由后端 CardExtractor 走 LLM 完成。
   保留两套逻辑会让同一份资料得到两种结果，且前端正则质量远低于 LLM。
   字段清单与中文标签改由 GET /api/v1/schema 提供。 */

/* ── usePress hook ───────────────────────────────────────────── */
export function usePress() {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  return { hovered, pressed, bind: {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => { setHovered(false); setPressed(false); },
    onMouseDown:  () => setPressed(true),
    onMouseUp:    () => setPressed(false),
  }};
}

/* ── RippleBtn ───────────────────────────────────────────────── */
export function RippleBtn({ onClick, disabled, style, children }: {
  onClick?: () => void; disabled?: boolean;
  style?: React.CSSProperties; children: React.ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [ripples, setRipples] = useState<{ id:number; x:number; y:number }[]>([]);
  const nid = useRef(0);
  const fire = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const r = ref.current!.getBoundingClientRect();
    const id = nid.current++;
    setRipples(rr => [...rr, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
    setTimeout(() => setRipples(rr => rr.filter(x => x.id !== id)), 600);
    onClick?.();
  };
  return (
    <button ref={ref} disabled={disabled} onClick={fire}
      style={{ position:"relative", overflow:"hidden", ...style }}>
      {children}
      {ripples.map(rp => (
        <span key={rp.id} style={{
          position:"absolute", left:rp.x, top:rp.y, width:6, height:6,
          borderRadius:"50%", background:"rgba(255,255,255,.5)",
          transform:"translate(-50%,-50%) scale(0)",
          animation:`ripple .55s ${E.smooth} forwards`, pointerEvents:"none",
        }}/>
      ))}
    </button>
  );
}

/* ── Toggle switch ───────────────────────────────────────────── */
export function Toggle({ value, onChange, label, icon }: {
  value: boolean; onChange: (v:boolean) => void; label: string; icon?: React.ReactNode;
}) {
  const { hovered, bind } = usePress();
  return (
    <button onClick={() => onChange(!value)}
      style={{
        display:"flex", alignItems:"center", gap:10, width:"100%",
        padding:"9px 12px", borderRadius:9, cursor:"pointer",
        border:`1px solid ${value ? U.blue+"55" : hovered ? U.blue+"33" : U.border}`,
        background: value ? U.blueXLight : hovered ? U.surfaceBlue : U.bg,
        transition:`all .2s ${E.smooth}`,
      }} {...bind}>
      {icon && <span style={{ color: value ? U.blue : U.textLight, transition:"color .2s" }}>{icon}</span>}
      <span style={{ flex:1, fontSize:11.5, color: value ? U.text : U.textMid, fontWeight: value?500:400 }}>{label}</span>
      <div style={{
        width:32, height:18, borderRadius:9, position:"relative",
        background: value ? U.blue : U.border,
        transition:`background .22s ${E.snappy}`, flexShrink:0,
      }}>
        <div style={{
          position:"absolute", top:2, left: value ? 16 : 2,
          width:14, height:14, borderRadius:"50%", background:"#fff",
          boxShadow:"0 1px 4px rgba(0,0,0,.18)",
          transition:`left .22s ${E.spring}`,
        }}/>
      </div>
    </button>
  );
}

/* ── FIcon ───────────────────────────────────────────────────── */
export function FIcon({ k, size=11 }: { k:string; size?:number }) {
  const m: Record<string, React.ReactNode> = {
    // 键名对齐后端 Card::FIELDS，旧的 institution/project/class 等
    // 是本地解析时代的产物，schema 里并不存在。
    name:              <User size={size}/>,
    name_en:           <User size={size}/>,
    title:             <Layers size={size}/>,
    department:        <Building2 size={size}/>,
    organization:      <Building2 size={size}/>,
    tagline:           <Bookmark size={size}/>,
    phone:             <Phone size={size}/>,
    email:             <Mail size={size}/>,
    website:           <Columns size={size}/>,
    address:           <MapPin size={size}/>,
    employee_id:       <Hash size={size}/>,
    host_organization: <Building2 size={size}/>,
    host_department:   <Users size={size}/>,
    event_topic:       <BookOpen size={size}/>,
  };
  return <>{m[k] ?? <Hash size={size}/>}</>;
}

/* ── MiniQR ──────────────────────────────────────────────────── */
export function MiniQR({ color="#1A2C40", size=44 }: { color?:string; size?:number }) {
  const s = size / 17;
  const corners: [number,number,number,number][] = [[0,0,7,7],[0,10,7,7],[10,0,7,7]];
  const inners:  [number,number,number,number][] = [[2,2,3,3],[2,12,3,3],[12,2,3,3]];
  const data: [number,number][] = [
    [0,8],[0,9],[1,8],[1,10],[2,9],[3,8],[3,10],[4,9],[5,8],[5,9],
    [8,0],[8,2],[8,4],[8,6],[8,8],[8,10],[8,12],[8,14],[8,16],
    [9,1],[9,5],[9,9],[9,13],[10,8],[10,10],[10,12],[10,16],
    [11,9],[11,13],[12,8],[12,10],[12,14],[12,16],[13,9],[13,11],[13,15],
    [14,8],[14,12],[14,16],[15,9],[15,13],[16,8],[16,11],[16,13],[16,16],
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {corners.map(([r,c,h,w],i) => <rect key={`c${i}`} x={c*s+.3} y={r*s+.3} width={w*s} height={h*s} fill="none" stroke={color} strokeWidth={s*.6} opacity={.5} rx={s*.18}/>)}
      {inners.map( ([r,c,h,w],i) => <rect key={`i${i}`} x={c*s+.3} y={r*s+.3} width={w*s} height={h*s} fill={color} opacity={.5} rx={s*.1}/>)}
      {data.map(   ([r,c],i)     => <rect key={`d${i}`} x={c*s+.3} y={r*s+.3} width={s*.8} height={s*.8} fill={color} opacity={.38} rx={s*.08}/>)}
    </svg>
  );
}

/* ── Barcode ─────────────────────────────────────────────────── */
export function Barcode({ color="#4E718A" }: { color?:string }) {
  const ws = [2,1,3,1,2,2,1,3,1,2,1,2,3,1,2,1,3,1,2,1,3,2,1];
  let x = 0;
  const bars: { x:number; w:number }[] = [];
  ws.forEach((w, i) => { if (i%2===0) bars.push({x,w}); x+=w+.7; });
  return (
    <svg width={x} height={18} viewBox={`0 0 ${x} 18`} style={{display:"block"}}>
      {bars.map((b,i) => <rect key={i} x={b.x} y={0} width={b.w} height={18} fill={color} opacity={.45}/>)}
    </svg>
  );
}

/* ── BadgeCard ───────────────────────────────────────────────── */
export function BadgeCard({ fields, template, accent, fontSize, styleK, custom, scale=1 }: {
  fields:Field[]; template:Template; accent:AccentKey;
  fontSize:FontSz; styleK:StyleKey; custom:CustomCfg; scale?:number;
}) {
  const ac  = ACCENTS[accent];
  const sel = fields.filter(f => f.selected);
  const get = (k:string) => sel.find(f => f.key===k)?.value ?? "";
  const has = (k:string) => sel.some(f => f.key===k);
  const fz  = { sm:.84, md:1, lg:1.15 }[fontSize];
  const rad = styleK==="minimal" ? 12 : 4;
  const SH  = "0 8px 32px rgba(30,50,80,.13), 0 2px 8px rgba(30,50,80,.08)";
  const bg="#FDFBF7", bgH="#F5F1E8", bdr="#E0D8C8";

  if (sel.length === 0) return (
    <div style={{ width:200*scale, height:280*scale, borderRadius:rad*scale,
      border:`2px dashed ${U.border}`, display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", gap:10*scale, opacity:.38 }}>
      <Eye size={28*scale} color={U.textFaint}/>
      <span style={{ fontSize:11*scale, color:U.textFaint, fontFamily:"'Outfit',sans-serif" }}>选择字段以预览</span>
    </div>
  );

  if (template === "custom") {
    const isL = custom.orientation === "landscape";
    const W = isL ? 320 : 200, H = isL ? 190 : 300;
    const others = sel.filter(f => !["name","title"].includes(f.key));
    return (
      <div style={{ width:W*scale, height:H*scale, background:bg, borderRadius:rad*scale,
        border:`1px solid ${bdr}`, boxShadow:SH, overflow:"hidden",
        fontFamily:"'Outfit',sans-serif", display:"flex", flexDirection:"column" }}>
        <div style={{ height:4*scale, background:ac.main }}/>
        <div style={{ background:bgH, padding:`${9*scale}px ${14*scale}px ${8*scale}px`,
          borderBottom:`1px solid ${bdr}`, textAlign:"center" }}>
          <div style={{ fontSize:7.5*scale*fz, letterSpacing:".3em", color:ac.main, textTransform:"uppercase" }}>
            {custom.subLabel || "CUSTOM BADGE"}
          </div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15*scale*fz, fontWeight:700, color:"#1A2C40" }}>
            {custom.headerLabel || "自 定 义"}
          </div>
        </div>
        <div style={{ flex:1, padding:`${11*scale}px ${14*scale}px ${10*scale}px`,
          display:"flex", flexDirection: isL?"row":"column", gap:10*scale }}>
          {custom.showPhoto && (
            <div style={{ width:isL?50*scale:40*scale, height:isL?50*scale:40*scale,
              borderRadius:"50%", background:ac.muted, border:`1px solid ${ac.main}44`,
              display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <User size={isL?22*scale:18*scale} color={ac.deep} strokeWidth={1.2}/>
            </div>
          )}
          <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
            {has("name")  && <div style={{ fontFamily:"'Playfair Display',serif", fontSize:13*scale*fz, fontWeight:600, color:"#1A2C40", lineHeight:1.2 }}>{get("name")}</div>}
            {has("title") && <div style={{ fontSize:7.5*scale*fz, color:"#8AABBB", marginTop:2*scale }}>{get("title")}</div>}
            {!isL && <div style={{ height:1*scale, background:bdr, margin:`${7*scale}px 0` }}/>}
            <div style={{ display:"flex", flexDirection:"column", gap:4.5*scale, flex:1 }}>
              {others.slice(0,5).map(f => (
                <div key={f.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                  <span style={{ fontSize:6.5*scale*fz, color:"#8AABBB", letterSpacing:".12em", textTransform:"uppercase", flexShrink:0 }}>{f.label}</span>
                  <span style={{ fontSize:8*scale*fz, color:"#1A2C40", fontWeight:500,
                    maxWidth:isL?150*scale:105*scale, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textAlign:"right" }}>{f.value}</span>
                </div>
              ))}
            </div>
            {(custom.showQR || custom.showBarcode || custom.showDots) && (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10*scale,
                paddingTop:6*scale, borderTop:`1px solid ${bdr}`, marginTop:4*scale }}>
                {custom.showQR      && <MiniQR color={ac.deep} size={36*scale}/>}
                {custom.showBarcode && <Barcode color={ac.deep}/>}
                {custom.showDots    && (
                  <div style={{ display:"flex", gap:3*scale }}>
                    {[1,2,3,4].map(i => <div key={i} style={{ width:5*scale, height:5*scale, borderRadius:"50%", background:i<=3?ac.main:bdr }}/>)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{ height:3*scale, background:ac.main }}/>
      </div>
    );
  }

  if (template === "business") {
    return (
      <div style={{ width:320*scale, height:190*scale, background:bg, borderRadius:rad*scale,
        border:`1px solid ${bdr}`, boxShadow:SH, display:"flex", flexDirection:"column",
        padding:`${18*scale}px ${22*scale}px`, position:"relative", overflow:"hidden",
        fontFamily:"'Outfit',sans-serif" }}>
        <div style={{ height:3*scale, background:ac.main, position:"absolute", top:0, left:0, right:0 }}/>
        <div style={{ display:"flex", alignItems:"center", gap:9*scale, marginBottom:"auto" }}>
          <div style={{ width:28*scale, height:28*scale, borderRadius:"50%", background:ac.muted,
            border:`1px solid ${ac.main}44`, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <Shield size={13*scale} color={ac.deep} strokeWidth={1.5}/>
          </div>
          {has("organization") && <span style={{ fontSize:11.5*scale*fz, fontWeight:600, color:"#1A2C40" }}>{get("organization")}</span>}
        </div>
        <div style={{ marginBottom:10*scale }}>
          {has("name")  && <div style={{ fontFamily:"'Playfair Display',serif", fontSize:21*scale*fz, fontWeight:600, color:"#1A2C40" }}>{get("name")}</div>}
          {has("title") && <div style={{ fontSize:9*scale*fz, color:"#8AABBB", letterSpacing:".14em", marginTop:2*scale }}>{get("title")}</div>}
        </div>
        <div style={{ height:1*scale, background:bdr, marginBottom:10*scale }}/>
        <div style={{ display:"flex", flexDirection:"column", gap:5*scale }}>
          {has("phone") && <div style={{ display:"flex", gap:7*scale, alignItems:"center" }}><Phone size={9*scale} color="#8AABBB"/><span style={{ fontSize:9.5*scale*fz, color:"#4E718A" }}>{get("phone")}</span></div>}
          {has("email") && <div style={{ display:"flex", gap:7*scale, alignItems:"center" }}><Mail size={9*scale} color="#8AABBB"/><span style={{ fontSize:9.5*scale*fz, color:"#4E718A" }}>{get("email")}</span></div>}
          {has("address")  && <div style={{ display:"flex", gap:7*scale, alignItems:"center" }}><MapPin size={9*scale} color="#8AABBB"/><span style={{ fontSize:9.5*scale*fz, color:"#4E718A" }}>{get("address")}</span></div>}
        </div>
        <div style={{ height:3*scale, background:ac.main, position:"absolute", bottom:0, left:0, right:0 }}/>
      </div>
    );
  }

  const isVisitor = template === "visitor";
  const others    = sel.filter(f => !["name","title"].includes(f.key));
  return (
    <div style={{ width:200*scale, height:300*scale, background:bg, borderRadius:rad*scale,
      border:`1px solid ${bdr}`, boxShadow:SH, display:"flex", flexDirection:"column",
      overflow:"hidden", fontFamily:"'Outfit',sans-serif" }}>
      <div style={{ height:4*scale, background:ac.main }}/>
      <div style={{ background:bgH, padding:`${10*scale}px ${14*scale}px ${8*scale}px`,
        borderBottom:`1px solid ${bdr}`, textAlign:"center" }}>
        <div style={{ fontSize:7.5*scale*fz, letterSpacing:".28em", color:ac.main, textTransform:"uppercase" }}>
          {isVisitor ? "Visitor Pass" : "Access Badge"}
        </div>
        <div style={{ fontFamily:"'Playfair Display',serif", fontSize:16*scale*fz, fontWeight:700, color:"#1A2C40" }}>
          {isVisitor ? "访 客" : "通 行 证"}
        </div>
      </div>
      <div style={{ flex:1, padding:`${12*scale}px ${14*scale}px ${10*scale}px`, display:"flex", flexDirection:"column" }}>
        <div style={{ display:"flex", alignItems:"center", gap:9*scale, marginBottom:9*scale }}>
          <div style={{ width:40*scale, height:40*scale, borderRadius:"50%", background:ac.muted,
            border:`1px solid ${ac.main}44`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <User size={18*scale} color={ac.deep} strokeWidth={1.2}/>
          </div>
          <div>
            {has("name")  && <div style={{ fontFamily:"'Playfair Display',serif", fontSize:13*scale*fz, fontWeight:600, color:"#1A2C40", lineHeight:1.2 }}>{get("name")}</div>}
            {has("title") && <div style={{ fontSize:7.5*scale*fz, color:"#8AABBB", marginTop:2*scale }}>{get("title")}</div>}
          </div>
        </div>
        <div style={{ height:1*scale, background:bdr, marginBottom:8*scale }}/>
        <div style={{ display:"flex", flexDirection:"column", gap:5.5*scale, flex:1 }}>
          {others.slice(0,6).map(f => (
            <div key={f.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
              <span style={{ fontSize:7*scale*fz, color:"#8AABBB", letterSpacing:".12em", textTransform:"uppercase", flexShrink:0 }}>{f.label}</span>
              <span style={{ fontSize:8.5*scale*fz, color:"#1A2C40", fontWeight:500,
                maxWidth:112*scale, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textAlign:"right" }}>{f.value}</span>
            </div>
          ))}
        </div>
        {!isVisitor
          ? <div style={{ paddingTop:7*scale, borderTop:`1px solid ${bdr}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:6.5*scale*fz, color:"#8AABBB", letterSpacing:".16em" }}>ACCESS LEVEL</span>
              <div style={{ display:"flex", gap:3*scale }}>
                {[1,2,3,4].map(i => <div key={i} style={{ width:6*scale, height:6*scale, borderRadius:"50%", background:i<=3?ac.main:bdr }}/>)}
              </div>
            </div>
          : <div style={{ display:"flex", justifyContent:"center", paddingTop:5*scale }}>
              <MiniQR color={ac.deep} size={42*scale}/>
            </div>
        }
      </div>
      <div style={{ height:3*scale, background:ac.main }}/>
    </div>
  );
}

/* ── OptionTile ──────────────────────────────────────────────── */
export function OptionTile({ active, onClick, children, row=false }: {
  active:boolean; onClick:()=>void; children:React.ReactNode; row?:boolean;
}) {
  const { hovered, pressed, bind } = usePress();
  return (
    <button onClick={onClick} style={{
      display:"flex", flexDirection:row?"row":"column",
      alignItems:"center", gap:row?11:7,
      padding:row?"10px 13px":"13px 6px 11px",
      borderRadius:10, cursor:"pointer", textAlign:"left",
      border:active?`1.5px solid ${U.blue}`:`1px solid ${hovered?U.blue+"44":U.border}`,
      background:active?U.blueXLight:hovered?U.surfaceBlue:U.bg,
      flex:row?undefined:1, width:row?"100%":undefined,
      boxShadow:active?"0 3px 12px rgba(58,118,196,.2)":hovered?"0 2px 8px rgba(58,118,196,.08)":"none",
      transform:`scale(${pressed?0.96:hovered?1.012:1})`,
      transition:`all .15s ${E.smooth}`, willChange:"transform",
    }} {...bind}>
      {children}
    </button>
  );
}

/* ── Section label ───────────────────────────────────────────── */
export function SLabel({ icon, text }: { icon:React.ReactNode; text:string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:11 }}>
      <span style={{ color:U.blue }}>{icon}</span>
      <span style={{ fontSize:10, color:U.textMid, letterSpacing:".2em", textTransform:"uppercase", fontWeight:600 }}>{text}</span>
    </div>
  );
}

/* ── Divider ─────────────────────────────────────────────────── */
export function Divider() {
  return <div style={{ height:1, background:U.borderLight }}/>;
}

/* ── CustomPanel ─────────────────────────────────────────────── */
export function CustomPanel({ cfg, onChange }: { cfg:CustomCfg; onChange:(c:CustomCfg)=>void }) {
  const set = <K extends keyof CustomCfg>(k:K, v:CustomCfg[K]) => onChange({...cfg, [k]:v});
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:9, padding:"13px 15px",
      borderRadius:10, background:U.blueXLight, border:`1px solid ${U.border}`,
      animation:`fadeSlideIn .25s ${E.smooth} both` }}>
      <div style={{ display:"flex", gap:6 }}>
        {(["portrait","landscape"] as const).map(o => {
          const active = cfg.orientation===o;
          return (
            <button key={o} onClick={()=>set("orientation",o)} style={{
              flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5,
              padding:"7px 0", borderRadius:7, cursor:"pointer",
              border:active?`1.5px solid ${U.blue}`:`1px solid ${U.border}`,
              background:active?U.surface:U.bg, color:active?U.blue:U.textMid,
              fontSize:11, fontWeight:active?600:400, transition:`all .16s ${E.smooth}`,
            }}>
              {o==="portrait" ? <Minimize2 size={12}/> : <Maximize2 size={12}/>}
              {o==="portrait" ? "竖版" : "横版"}
            </button>
          );
        })}
      </div>
      <div>
        <div style={{ fontSize:9.5, color:U.textLight, letterSpacing:".15em", marginBottom:5, textTransform:"uppercase" }}>标题文字</div>
        <input value={cfg.headerLabel} onChange={e=>set("headerLabel",e.target.value)}
          placeholder="自 定 义"
          style={{ width:"100%", padding:"7px 10px", borderRadius:7, border:`1px solid ${U.border}`,
            background:U.surface, fontSize:12, color:U.text, outline:"none", boxSizing:"border-box",
            fontFamily:"'Playfair Display',serif", letterSpacing:".06em" }}/>
      </div>
      <div>
        <div style={{ fontSize:9.5, color:U.textLight, letterSpacing:".15em", marginBottom:5, textTransform:"uppercase" }}>副标题</div>
        <input value={cfg.subLabel} onChange={e=>set("subLabel",e.target.value)}
          placeholder="CUSTOM BADGE"
          style={{ width:"100%", padding:"7px 10px", borderRadius:7, border:`1px solid ${U.border}`,
            background:U.surface, fontSize:11, color:U.text, outline:"none", boxSizing:"border-box",
            letterSpacing:".12em" }}/>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
        <Toggle value={cfg.showPhoto}   onChange={v=>set("showPhoto",v)}   label="显示照片区域" icon={<ImageIcon size={12}/>}/>
        <Toggle value={cfg.showQR}      onChange={v=>set("showQR",v)}      label="显示二维码"   icon={<QrCode size={12}/>}/>
        <Toggle value={cfg.showBarcode} onChange={v=>set("showBarcode",v)} label="显示条形码"   icon={<BarChart2 size={12}/>}/>
        <Toggle value={cfg.showDots}    onChange={v=>set("showDots",v)}    label="显示权限等级" icon={<Sliders size={12}/>}/>
      </div>
    </div>
  );
}

/* ── PreviewSheet ────────────────────────────────────────────── */
export function PreviewSheet({ open, onClose, fields, template, accent, fontSize, styleK, custom }: {
  open:boolean; onClose:()=>void;
  fields:Field[]; template:Template; accent:AccentKey;
  fontSize:FontSz; styleK:StyleKey; custom:CustomCfg;
}) {
  return (
    <>
      <div onClick={onClose} style={{
        position:"fixed", inset:0, background:"rgba(20,35,55,.32)",
        backdropFilter:"blur(4px)",
        opacity:open?1:0, pointerEvents:open?"auto":"none",
        transition:`opacity .3s ${E.smooth}`, zIndex:40,
      }}/>
      <div style={{
        position:"fixed", left:0, right:0, bottom:0,
        background:U.surface, borderRadius:"20px 20px 0 0",
        boxShadow:"0 -12px 60px rgba(20,35,55,.18)",
        transform:open?"translateY(0)":"translateY(100%)",
        transition:`transform .42s ${E.spring}`,
        zIndex:50, maxHeight:"88vh", display:"flex", flexDirection:"column",
        willChange:"transform",
      }}>
        <div style={{ padding:"18px 24px 14px", borderBottom:`1px solid ${U.borderLight}`,
          display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:U.text }}>工牌预览</div>
            <div style={{ fontSize:10.5, color:U.textLight, marginTop:3 }}>
              {{ visitor:"访客通行证", access:"员工通行证", business:"名片", custom:"自定义" }[template]}
              {" · "}{ACCENTS[accent].label}
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <RippleBtn style={{
              display:"flex", alignItems:"center", gap:6, padding:"8px 18px",
              borderRadius:9, background:U.blue, border:"none", cursor:"pointer",
              color:"#fff", fontSize:12.5, fontWeight:600,
            }}>
              <Download size={13}/> 导出
            </RippleBtn>
            <button onClick={onClose} style={{
              width:36, height:36, borderRadius:"50%",
              background:U.bg, border:`1px solid ${U.border}`,
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
            }}>
              <X size={15} color={U.textMid}/>
            </button>
          </div>
        </div>
        <div style={{ flex:1, overflow:"auto", display:"flex", alignItems:"center",
          justifyContent:"center", padding:"48px 32px 56px", minHeight:360 }}>
          <div style={{ position:"relative" }}>
            <svg style={{ position:"absolute", inset:-64, pointerEvents:"none", opacity:.08 }}
              width="calc(100% + 128px)" height="calc(100% + 128px)">
              <defs><pattern id="pd" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="1.5" cy="1.5" r="1" fill={U.blue}/>
              </pattern></defs>
              <rect width="100%" height="100%" fill="url(#pd)"/>
            </svg>
            <div style={{ position:"relative", zIndex:1, animation:`floatIn .5s ${E.spring} both` }}>
              <BadgeCard fields={fields} template={template} accent={accent}
                fontSize={fontSize} styleK={styleK} custom={custom} scale={1.2}/>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Options sidebar (shared between Page2 layouts) ──────────── */
export function OptionsSidebar({
  template, setTemplate, accent, setAccent,
  fontSize, setFontSize, styleK, setStyleK,
  custom, setCustom, onExport,
}: {
  template:Template;   setTemplate:(t:Template)=>void;
  accent:AccentKey;    setAccent:(a:AccentKey)=>void;
  fontSize:FontSz;     setFontSize:(f:FontSz)=>void;
  styleK:StyleKey;     setStyleK:(s:StyleKey)=>void;
  custom:CustomCfg;    setCustom:(c:CustomCfg)=>void;
  onExport?:()=>void;
}) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:22 }}>
      {/* Template */}
      <div>
        <SLabel icon={<Layout size={11}/>} text="模板"/>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:9 }}>
          {(["visitor","access","business","custom"] as Template[]).map(t => {
            const active = template===t;
            const meta: Record<Template,{label:string;icon:React.ReactNode}> = {
              visitor:  {label:"访客证", icon:<Shield size={13}/>},
              access:   {label:"通行证", icon:<Hash size={13}/>},
              business: {label:"名片",   icon:<AlignLeft size={13}/>},
              custom:   {label:"自定义", icon:<Sliders size={13}/>},
            };
            return (
              <OptionTile key={t} active={active} onClick={()=>setTemplate(t)}>
                <div style={{ color:active?U.blue:U.textLight }}>{meta[t].icon}</div>
                <span style={{ fontSize:11, color:active?U.blue:U.textMid, fontWeight:active?600:400 }}>{meta[t].label}</span>
                <div style={{ width:t==="business"?36:22, height:t==="business"?22:32, borderRadius:active?6:2,
                  background:active?U.blueLight:U.border,
                  border:`1px solid ${active?U.blue+"44":U.borderLight}`,
                  transition:`all .2s ${E.smooth}` }}/>
              </OptionTile>
            );
          })}
        </div>
        <div style={{ fontSize:10, color:U.textFaint, lineHeight:1.65, marginBottom:8 }}>
          {{ visitor:"访客当日通行，附二维码验证", access:"员工长期凭证，含权限等级",
             business:"横版名片，附完整联系方式", custom:"自由组合版式与元素" }[template]}
        </div>
        <div style={{ maxHeight:template==="custom"?600:0, overflow:"hidden",
          transition:`max-height .38s ${E.smooth}` }}>
          <CustomPanel cfg={custom} onChange={setCustom}/>
        </div>
      </div>

      <Divider/>

      {/* Accent */}
      <div>
        <SLabel icon={<Palette size={11}/>} text="工牌主题色"/>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {(["rose","blue","gold"] as AccentKey[]).map(k => {
            const active = accent===k;
            const ac = ACCENTS[k];
            return (
              <OptionTile key={k} active={active} onClick={()=>setAccent(k)} row>
                <div style={{ width:32, height:36, borderRadius:5, background:"#FDFBF7",
                  border:"1px solid #E0D8C8", overflow:"hidden", position:"relative", flexShrink:0 }}>
                  <div style={{ height:3, background:ac.main }}/>
                  <div style={{ position:"absolute", bottom:0, left:0, right:0, height:2, background:ac.main }}/>
                  <div style={{ position:"absolute", top:"50%", left:"50%",
                    transform:"translate(-50%,-50%)", width:10, height:10,
                    borderRadius:"50%", background:ac.muted, border:`1px solid ${ac.main}44` }}/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:active?U.blue:U.text, fontWeight:active?600:500 }}>{ac.label}</div>
                  <div style={{ fontSize:10, color:U.textFaint, marginTop:2 }}>{ac.desc}</div>
                </div>
                <div style={{ width:9, height:9, borderRadius:"50%",
                  background:active?U.blue:U.border, transition:`background .2s ${E.spring}` }}/>
              </OptionTile>
            );
          })}
        </div>
      </div>

      <Divider/>

      {/* Font size */}
      <div>
        <SLabel icon={<Type size={11}/>} text="字号大小"/>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:7 }}>
          {(["sm","md","lg"] as FontSz[]).map((s, i) => (
            <OptionTile key={s} active={fontSize===s} onClick={()=>setFontSize(s)}>
              <span style={{ fontSize:[14,18,22][i], lineHeight:1,
                color:fontSize===s?U.blue:U.textMid, fontFamily:"'Playfair Display',serif" }}>文</span>
              <span style={{ fontSize:9.5, color:fontSize===s?U.blue:U.textLight, fontWeight:fontSize===s?600:400 }}>
                {["偏小","标准","偏大"][i]}
              </span>
            </OptionTile>
          ))}
        </div>
      </div>

      <Divider/>

      {/* Style */}
      <div>
        <SLabel icon={<Columns size={11}/>} text="边框风格"/>
        <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
          {(["minimal","formal"] as StyleKey[]).map(s => {
            const active = styleK===s;
            const meta = { minimal:{n:"圆润简约",d:"圆角边框"}, formal:{n:"方正正式",d:"直角边框"} }[s];
            return (
              <OptionTile key={s} active={active} onClick={()=>setStyleK(s)} row>
                <div style={{ width:30, height:30, flexShrink:0,
                  borderRadius:s==="minimal"?15:4,
                  background:active?U.blueLight:U.border,
                  border:`1px solid ${active?U.blue+"44":U.borderLight}`,
                  transition:`border-radius .25s ${E.spring}, background .15s` }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, color:active?U.blue:U.text, fontWeight:active?600:500 }}>{meta.n}</div>
                  <div style={{ fontSize:10, color:U.textFaint }}>{meta.d}</div>
                </div>
                {active && <Check size={13} color={U.blue}/>}
              </OptionTile>
            );
          })}
        </div>
      </div>

      {onExport && (
        <>
          <Divider/>
          <RippleBtn onClick={onExport} style={{
            width:"100%", padding:"12px 0", borderRadius:10, border:"none", cursor:"pointer",
            background:`linear-gradient(135deg, ${U.blue}, ${U.blueDark})`,
            color:"#fff", fontSize:13, fontWeight:600, letterSpacing:".05em",
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            boxShadow:"0 6px 22px rgba(58,118,196,.38)",
          }}>
            <Download size={14}/> 导出工牌
          </RippleBtn>
        </>
      )}
    </div>
  );
}

/* ── Global keyframes (inject once via App root) ─────────────── */
export const GLOBAL_STYLES = `
  @keyframes spin        { to { transform: rotate(360deg); } }
  @keyframes ripple      { to { transform: translate(-50%,-50%) scale(30); opacity: 0; } }
  @keyframes checkPop    { 0%{transform:scale(.4);opacity:0} 65%{transform:scale(1.3)} 100%{transform:scale(1);opacity:1} }
  @keyframes fadeSlideIn { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:translateY(0)} }
  @keyframes floatIn     { from{opacity:0;transform:translateY(20px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes dotBounce   { 0%,100%{transform:translateY(0)} 45%{transform:translateY(-5px)} }
  * { box-sizing: border-box; }
  textarea:focus { outline: none; }
  input:focus { outline: none; }
  button { font-family: 'Outfit', sans-serif; }
  ::-webkit-scrollbar       { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #D8E5F2; border-radius: 4px; }
  html { scroll-behavior: smooth; }
`;
