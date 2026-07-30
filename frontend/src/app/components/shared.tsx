import { useState, useRef, useEffect } from "react";
import {
  User, Phone, Mail, Building2, Hash, Calendar, MapPin,
  Shield, Check, Download, Layers, AlignLeft, Eye, X,
  Palette, Layout, SlidersHorizontal, Sliders,
  Minimize2, Maximize2, Image as ImageIcon, QrCode, BarChart2,
  BookOpen, Users, Bookmark,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────── */
export interface Field {
  id: string; key: string; label: string; value: string;
  selected: boolean; category: "person" | "contact" | "access";
  icon?: string;
}
export type Template  = "visitor" | "access" | "business" | "custom";
export type AccentKey = "rose" | "blue" | "gold";
export type FontSz    = "sm" | "md" | "lg";

/* 字号系数。卡片高度要跟着字号一起撑，否则大字号下内容超高，
   底部的二维码会被卡片的 overflow:hidden 裁掉。
   BadgeCanvas 算等比缩放系数时用的是同一套值，两边必須一致。 */
export const FZ: Record<FontSz, number> = { sm:.84, md:1, lg:1.15 };

/* 内容区高度的字号补偿。只补高不补宽 —— 宽度由折行吸收，
   高度才是会把二维码顶出去的方向。 */
export function fzHeightFactor(fontSize: FontSz) {
  // 只向上补高，不向下压。字号变小时内容本来就有余量，
  // 而 padding、二维码、分隔线这些固定量不跟着缩，
  // 再压卡片高度只会把它们挤到一起。
  const f = FZ[fontSize];
  return f <= 1 ? 1 : 1 + (f - 1) * 0.85;
}
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
  // 后端建卡后的 id。刷新会丢 location.state，第二页据此回源重取。
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
    organization:      <Building2 size={size}/>,
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
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink:0, display:"block" }}>
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
    <svg width={x} height={18} viewBox={`0 0 ${x} 18`} style={{display:"block", flexShrink:0}}>
      {bars.map((b,i) => <rect key={i} x={b.x} y={0} width={b.w} height={18} fill={color} opacity={.45}/>)}
    </svg>
  );
}

/* 卡片上的证件照。传了图就显图，没传退回人像图标占位。
   objectFit:cover 保证不拉伸 —— 证件照比例不一，又是圆形框，
   拉伸变形比裁切难看得多。 */
function Portrait({ url, size, ac, iconSize }: {
  url?:string|null; size:number;
  ac:{ main:string; deep:string; muted:string }; iconSize:number;
}) {
  return (
    <div style={{
      width:size, height:size, borderRadius:"50%",
      background:ac.muted, border:`1px solid ${ac.main}44`,
      display:"flex", alignItems:"center", justifyContent:"center",
      flexShrink:0, overflow:"hidden",
    }}>
      {url
        ? <img src={url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", display:"block" }}/>
        : <User size={iconSize} color={ac.deep} strokeWidth={1.2}/>}
    </div>
  );
}

/* ── BadgeCard ───────────────────────────────────────────────── */
export function BadgeCard({ fields, template, accent, fontSize, styleK, custom, portraitUrl, scale=1 }: {
  fields:Field[]; template:Template; accent:AccentKey;
  fontSize:FontSz; styleK:StyleKey; custom:CustomCfg; portraitUrl?:string|null; scale?:number;
}) {
  const ac  = ACCENTS[accent];
  const sel = fields.filter(f => f.selected);
  const get = (k:string) => sel.find(f => f.key===k)?.value ?? "";
  const has = (k:string) => sel.some(f => f.key===k);
  const fz  = FZ[fontSize];
  // 字号放大时卡片同步变高，内容才不会顶掉底部的二维码。
  const hf  = fzHeightFactor(fontSize);
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
    const W = isL ? 320 : 200, H = (isL ? 190 : 300) * hf;
    const others = sel.filter(f => f.key !== "name");
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
            <Portrait url={portraitUrl} size={isL?50*scale:40*scale}
              ac={ac} iconSize={isL?22*scale:18*scale}/>
          )}
          <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
            {has("name")  && <div style={{ fontFamily:"'Playfair Display',serif", fontSize:13*scale*fz, fontWeight:600, color:"#1A2C40", lineHeight:1.2 }}>{get("name")}</div>}
            {!isL && <div style={{ height:1*scale, background:bdr, margin:`${7*scale}px 0` }}/>}
            <div style={{ display:"flex", flexDirection:"column", gap:4.5*scale, flex:1 }}>
              {others.slice(0,5).map(f => (
                <div key={f.key} style={{ display:"flex", flexDirection:"column", gap:1*scale, minWidth:0 }}>
                  <span style={{ fontSize:6.5*scale*fz, color:"#8AABBB", letterSpacing:".1em", textTransform:"uppercase", lineHeight:1.25 }}>{f.label}</span>
                  <span style={{ fontSize:8*scale*fz, color:"#1A2C40", fontWeight:500, lineHeight:1.3,
                    overflowWrap:"break-word", wordBreak:"break-word" }}>{f.value}</span>
                </div>
              ))}
            </div>
            {(custom.showQR || custom.showBarcode || custom.showDots) && (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10*scale,
                paddingTop:6*scale, borderTop:`1px solid ${bdr}`, marginTop:4*scale, flexShrink:0 }}>
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
        </div>
        <div style={{ height:1*scale, background:bdr, marginBottom:10*scale }}/>
        <div style={{ display:"flex", flexDirection:"column", gap:5*scale }}>
          {has("area")  && <div style={{ display:"flex", gap:7*scale, alignItems:"center" }}><MapPin size={9*scale} color="#8AABBB"/><span style={{ fontSize:9.5*scale*fz, color:"#4E718A" }}>{get("area")}</span></div>}
        </div>
        <div style={{ height:3*scale, background:ac.main, position:"absolute", bottom:0, left:0, right:0 }}/>
      </div>
    );
  }

  const isVisitor = template === "visitor";
  const others    = sel.filter(f => f.key !== "name");
  return (
    <div style={{ width:200*scale, height:300*hf*scale, background:bg, borderRadius:rad*scale,
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
          <Portrait url={portraitUrl} size={40*scale}
            ac={ac} iconSize={18*scale}/>
          <div>
            {has("name")  && <div style={{ fontFamily:"'Playfair Display',serif", fontSize:13*scale*fz, fontWeight:600, color:"#1A2C40", lineHeight:1.2 }}>{get("name")}</div>}
          </div>
        </div>
        <div style={{ height:1*scale, background:bdr, marginBottom:8*scale }}/>
        <div style={{ display:"flex", flexDirection:"column", gap:5.5*scale, flex:1 }}>
          {others.slice(0,6).map(f => (
            <div key={f.key} style={{ display:"flex", flexDirection:"column", gap:1*scale, minWidth:0 }}>
              <span style={{ fontSize:7*scale*fz, color:"#8AABBB", letterSpacing:".1em", textTransform:"uppercase", lineHeight:1.25 }}>{f.label}</span>
              <span style={{ fontSize:8.5*scale*fz, color:"#1A2C40", fontWeight:500, lineHeight:1.3,
                overflowWrap:"break-word", wordBreak:"break-word" }}>{f.value}</span>
            </div>
          ))}
        </div>
        {!isVisitor
          ? <div style={{ paddingTop:7*scale, borderTop:`1px solid ${bdr}`, display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
              <span style={{ fontSize:6.5*scale*fz, color:"#8AABBB", letterSpacing:".16em" }}>ACCESS LEVEL</span>
              <div style={{ display:"flex", gap:3*scale }}>
                {[1,2,3,4].map(i => <div key={i} style={{ width:6*scale, height:6*scale, borderRadius:"50%", background:i<=3?ac.main:bdr }}/>)}
              </div>
            </div>
          : <div style={{ display:"flex", justifyContent:"center", paddingTop:5*scale, flexShrink:0 }}>
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

/* ── 导出面板里的实物尺寸输入 ─────────────────────────────────
   本地保留字符串草稿：中途清空或输入半个数字时不该立刻改预览。
   失焦或回车才提交。 */
function SheetSizeFields({ widthMm, heightMm, minMm, maxMm, onCommit }: {
  widthMm:number; heightMm:number; minMm:number; maxMm:number;
  onCommit:(w:number, h:number)=>void;
}) {
  const [draft, setDraft] = useState({ w:String(widthMm), h:String(heightMm) });

  // 外部尺寸变了（换卡片/回源重取）要跟上，否则显示的是上一张的尺寸。
  useEffect(() => {
    setDraft({ w:String(widthMm), h:String(heightMm) });
  }, [widthMm, heightMm]);

  const valid = (n:number) => Number.isInteger(n) && n >= minMm && n <= maxMm;
  const wNum = parseInt(draft.w, 10);
  const hNum = parseInt(draft.h, 10);
  const bad  = !valid(wNum) || !valid(hNum);

  const commit = () => {
    if (bad) { setDraft({ w:String(widthMm), h:String(heightMm) }); return; }
    onCommit(wNum, hNum);
  };

  const box: React.CSSProperties = {
    width:52, padding:"6px 8px", borderRadius:7,
    border:`1px solid ${bad ? "#C05060" : U.border}`, background:U.surface,
    fontSize:12, color:U.text, fontFamily:"'Outfit',sans-serif",
    outline:"none", textAlign:"center",
  };

  return (
    <div style={{ display:"flex", alignItems:"center", gap:6 }}
      title={`实物尺寸，${minMm}–${maxMm}mm`}>
      <input type="number" inputMode="numeric" value={draft.w} aria-label="宽 (mm)"
        min={minMm} max={maxMm} step={1} style={box}
        onChange={e => setDraft(d => ({ ...d, w:e.target.value }))}
        onBlur={commit} onKeyDown={e => e.key === "Enter" && commit()}/>
      <span style={{ fontSize:11, color:U.textFaint }}>×</span>
      <input type="number" inputMode="numeric" value={draft.h} aria-label="高 (mm)"
        min={minMm} max={maxMm} step={1} style={box}
        onChange={e => setDraft(d => ({ ...d, h:e.target.value }))}
        onBlur={commit} onKeyDown={e => e.key === "Enter" && commit()}/>
      <span style={{ fontSize:11, color:U.textFaint }}>mm</span>
    </div>
  );
}

/* ── PreviewSheet ────────────────────────────────────────────── */
export function PreviewSheet({ open, onClose, fields, template, accent, fontSize, styleK, custom, portraitUrl, onExport, exporting, size }: {
  open:boolean; onClose:()=>void;
  fields:Field[]; template:Template; accent:AccentKey;
  fontSize:FontSz; styleK:StyleKey; custom:CustomCfg; portraitUrl?:string|null;
  onExport?:()=>void; exporting?:boolean;
  // 实物尺寸收进导出面板：改尺寸和导出是同一件事的两步，
  // 分散在两处会让人以为底栏的宽高跟导出无关。
  size?:{
    widthMm:number; heightMm:number; minMm:number; maxMm:number;
    onCommit:(w:number, h:number)=>void;
  };
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
            <div style={{ fontSize:15, fontWeight:700, color:U.text }}>导出工牌</div>
            <div style={{ fontSize:10.5, color:U.textLight, marginTop:3 }}>
              {{ visitor:"访客通行证", access:"员工通行证", business:"名片", custom:"自定义" }[template]}
              {" · "}{ACCENTS[accent].label}
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            {size && <SheetSizeFields {...size}/>}
            <RippleBtn onClick={onExport} disabled={exporting} style={{
              display:"flex", alignItems:"center", gap:6, padding:"8px 18px",
              borderRadius:9, background:U.blue, border:"none",
              cursor:exporting ? "default" : "pointer", opacity:exporting ? .6 : 1,
              color:"#fff", fontSize:12.5, fontWeight:600,
            }}>
              <Download size={13}/> {exporting ? "导出中…" : "导出"}
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
                fontSize={fontSize} styleK={styleK} custom={custom}
                portraitUrl={portraitUrl} scale={1.2}/>
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
  custom, setCustom, onExport, exporting,
}: {
  template:Template;   setTemplate:(t:Template)=>void;
  accent:AccentKey;    setAccent:(a:AccentKey)=>void;
  custom:CustomCfg;    setCustom:(c:CustomCfg)=>void;
  onExport?:()=>void;
  exporting?:boolean;
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

      {onExport && (
        <>
          <Divider/>
          <RippleBtn onClick={onExport} disabled={exporting} style={{
            width:"100%", padding:"12px 0", borderRadius:10, border:"none",
            cursor:exporting ? "default" : "pointer", opacity:exporting ? .6 : 1,
            background:`linear-gradient(135deg, ${U.blue}, ${U.blueDark})`,
            color:"#fff", fontSize:13, fontWeight:600, letterSpacing:".05em",
            display:"flex", alignItems:"center", justifyContent:"center", gap:8,
            boxShadow:"0 6px 22px rgba(58,118,196,.38)",
          }}>
            <Download size={14}/> {exporting ? "导出中…" : "导出工牌"}
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
