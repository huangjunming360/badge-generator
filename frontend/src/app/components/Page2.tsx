import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router";
import { ArrowLeft, Download, SlidersHorizontal, Plus, Minus } from "lucide-react";
import {
  Field, Template, AccentKey, FontSz, StyleKey, CustomCfg, NavState,
  E, U, ACCENTS, AI_DESIGN_WATERMARK,
  BadgeCard, PreviewSheet, OptionsSidebar, RippleBtn, fzHeightFactor,
} from "./shared";
import AiTemplateDesigner from "./AiTemplateDesigner";
import { HtmlBadge } from "./HtmlBadge";
import { BadgeCanvas, canvasSizeMm, templateContentSize } from "./BadgeCanvas";
import { PreviewViewport, usePreviewViewport, MIN_ZOOM, MAX_ZOOM } from "./PreviewViewport";
import { fetchCard, fetchSchema } from "../../api/cards";
import { toFields } from "../../api/fields";
import { ApiError } from "../../api/client";
import {
  exportElementToPng,
  ExportError,
  renderElementToDataUrl,
} from "../exportBadge";
import {
  DEFAULT_CUSTOM_TEMPLATE,
  resolveCustomTemplateSize,
  type CustomTemplateDesign,
} from "../customTemplate";
import type { HtmlTemplateDocument } from "../htmlTemplate";

/* 视口缩放的小圆按钮。 */
function ZoomBtn({ label, onClick, disabled, children }: {
  label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={label} aria-label={label} style={{
      width:28, height:28, borderRadius:8, flexShrink:0,
      border:`1px solid ${U.border}`, background:U.surface,
      color:disabled ? U.textFaint : U.textMid,
      cursor:disabled ? "default" : "pointer", opacity:disabled ? .5 : 1,
      display:"flex", alignItems:"center", justifyContent:"center",
      transition:`all .16s ${E.smooth}`,
    }}>
      {children}
    </button>
  );
}

export default function Page2() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const saved     = location.state as NavState | null;

  const [fields, setFields]     = useState<Field[]>(saved?.fields ?? []);
  const [template, setTemplate] = useState<Template>("visitor");
  const [accent, setAccent]     = useState<AccentKey>("rose");
  // 字号与边框风格不再开放给用户调，固定用标准值。
  const fontSize: FontSz = "md";
  const styleK: StyleKey = "minimal";
  const [custom, setCustom] = useState<CustomCfg>(() => ({
    ...DEFAULT_CUSTOM_TEMPLATE,
  }));
  const [templateDocument, setTemplateDocument] =
    useState<HtmlTemplateDocument | null>(null);
  const [templateImageUrl, setTemplateImageUrl] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [optPanelOpen, setOptPanelOpen] = useState(true);
  const [aiDesignBusy, setAiDesignBusy] = useState(false);

  const [cardId] = useState<number | null>(saved?.cardId ?? null);
  // 导出尺寸是目标像素宽度；高度按当前模板的实际比例等比生成。
  const [exportSize, setExportSize] = useState(1100); // 默认高清 1100×1700px
  // 预览缩放档位选择器已下线，固定 1×。视口的滚轮/按钮缩放照旧可用。
  const previewScale = 1;
  const [error, setError] = useState<string | null>(null);
  // 上传的证件照。没传就为 null，卡片上退回占位头像。
  // 从 Page1 传过来的裁切/上传照片优先，刷新后才回源拿
  const [portraitUrl, setPortraitUrl] = useState<string | null>(
    saved?.portraitUrl ?? null
  );

  // 预览视口：滚轮缩放与拖拽平移。只影响看，不影响 mm 实物尺寸。
  const { view, setView, reset: resetView, zoomBy } = usePreviewViewport();

  const [exporting, setExporting] = useState(false);

  // 刷新会丢 location.state。有 cardId 就回源重取，保证刷新不丢数据。
  useEffect(() => {
    if (!cardId) return;
    let alive = true;

    Promise.all([fetchCard(cardId), fetchSchema()])
      .then(([card, schema]) => {
        if (!alive) return;
        // 如果 location.state 没传肖像才用服务器的
        if (!saved?.portraitUrl && !saved?.portraitRemoved) setPortraitUrl(card.portrait?.url ?? null);
        // 没有从上一页带过来字段时（直接刷新本页），用后端数据填充。
        if (!saved?.fields?.length) setFields(toFields(card.fields, schema.fields));
      })
      .catch(e => { if (alive) setError(e instanceof ApiError ? e.message : "读取失败"); });

    return () => { alive = false; };
  }, [cardId, saved?.fields?.length, saved?.portraitUrl]);

  const goBack = () => {
    navigate("/", { state: { rawText: saved?.rawText ?? "", fields, cardId, portraitUrl, imgName: portraitUrl ? (saved?.imgName ?? "📷 证件照") : null, sourceName: saved?.sourceName ?? null, portraitRemoved: saved?.portraitRemoved } satisfies NavState });
  };

  const badgeProps = { fields, template, accent, fontSize, styleK, custom, portraitUrl };
  const customTemplateSize = resolveCustomTemplateSize(
    custom,
    fields.filter(field => field.selected).length,
  );
  const contentSize = templateContentSize(
    template,
    custom.orientation,
    fzHeightFactor(fontSize),
    customTemplateSize,
  );

  const captureAiPreview = useCallback(
    (
      design: CustomTemplateDesign,
      document: HtmlTemplateDocument | null,
      imageUrl: string | null,
    ) =>
      renderElementToDataUrl(
        document ? (
          <HtmlBadge
            fields={fields}
            design={design}
            templateDocument={document}
            portraitUrl={portraitUrl}
            templateImageUrl={imageUrl}
          />
        ) : (
          <BadgeCard
            fields={fields}
            template="custom"
            accent={accent}
            fontSize={fontSize}
            styleK={styleK}
            custom={design}
            portraitUrl={portraitUrl}
            scale={1}
          />
        ),
      ),
    [fields, accent, fontSize, styleK, portraitUrl],
  );

  const applyAiDesign = useCallback(
    (
      design: CustomTemplateDesign,
      document: HtmlTemplateDocument | null,
      imageUrl: string | null,
    ) => {
      setCustom(design);
      setTemplateDocument(document);
      setTemplateImageUrl(imageUrl);
      setTemplate("custom");
    },
    [],
  );

  // 导出按当前设计稿比例，通过 exportSize（像素宽度）控制清晰度。
  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const who = fields.find(f => f.key === "name")?.value?.trim();
      // 预览与导出共用同一份解析尺寸，避免自定义画布导出时被二次缩放。
      const scale = exportSize / contentSize.width;
      const exportElement =
        template === "custom" && templateDocument ? (
          <HtmlBadge
            fields={fields}
            design={custom}
            templateDocument={templateDocument}
            portraitUrl={portraitUrl}
            templateImageUrl={templateImageUrl}
          />
        ) : (
          <BadgeCard {...badgeProps} scale={1} />
        );

      await exportElementToPng(
        exportElement,
        who ? `工牌_${who}` : "工牌",
        scale,
      );
    } catch (e) {
      setError(e instanceof ExportError ? e.message : "导出失败，请重试");
    } finally {
      setExporting(false);
    }
  }, [exporting, fields, template, accent, fontSize, styleK, custom, templateDocument, templateImageUrl, portraitUrl, exportSize, badgeProps, contentSize.width]);

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
          {{ visitor:"访客通行证", access:"员工通行证", business:"名片", custom:"AI 设计", figma:"精美设计" }[template]}
          {template !== "custom" && <>{" · "}{ACCENTS[accent].label}</>}
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
          <Download size={13}/> 导出工牌
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
          position:"relative", overflow:"hidden", minWidth:0 }}>

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

          {/* 可缩放拖拽的视口。工牌尺寸一大就超出容器，
              让用户能自己缩小、拖看局部，比只给固定档位实用。 */}
          <PreviewViewport view={view} setView={setView}>
            <div style={{ animation:`floatIn .5s ${E.spring} both` }}>
              {/* AI 设计直接展示真实画布尺寸，宽高变化会立即反映在预览中；
                  内置模板仍放进 55×85mm 实物画布，保持原来的打印语义。 */}
              {template === "custom" ? (
                templateDocument ? (
                  <HtmlBadge
                    fields={fields}
                    design={custom}
                    templateDocument={templateDocument}
                    portraitUrl={portraitUrl}
                    templateImageUrl={templateImageUrl}
                  />
                ) : (
                  <BadgeCard {...badgeProps} scale={1}/>
                )
              ) : (
                <BadgeCanvas
                  {...canvasSizeMm(55, 85, template, custom.orientation)}
                  contentWidth={contentSize.width}
                  contentHeight={contentSize.height}
                  previewScale={previewScale}
                >
                  <BadgeCard {...badgeProps} scale={1}/>
                </BadgeCanvas>
              )}
            </div>
          </PreviewViewport>

          {/* 视口控件条：缩放按钮 + 实物尺寸。固定在预览区底部，
              不进视口，否则会跟着一起缩放平移。 */}
          <div style={{
            position:"relative", zIndex:2, flexShrink:0,
            background:U.surface + "F2", borderTop:`1px solid ${U.border}`,
            padding:"10px 20px 12px",
            display:"flex", flexDirection:"column", alignItems:"center", gap:10,
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <ZoomBtn label="缩小" onClick={() => zoomBy(1 / 1.25)}
                disabled={view.zoom <= MIN_ZOOM}><Minus size={13}/></ZoomBtn>
              <button onClick={resetView} style={{
                minWidth:62, padding:"5px 10px", borderRadius:8,
                border:`1px solid ${U.border}`, background:U.surface,
                cursor:"pointer", fontSize:11.5, color:U.textMid,
                fontFamily:"'Outfit',sans-serif",
              }} title="恢复原始视图">
                {Math.round(view.zoom * 100)}%
              </button>
              <ZoomBtn label="放大" onClick={() => zoomBy(1.25)}
                disabled={view.zoom >= MAX_ZOOM}><Plus size={13}/></ZoomBtn>
              <span style={{ fontSize:10.5, color:U.textFaint, marginLeft:6 }}>
                滚轮缩放 · 拖拽平移 · 点百分比复位
              </span>
            </div>
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
                templateSwitchDisabled={aiDesignBusy}
                accent={accent}       setAccent={setAccent}
                custom={custom}       setCustom={setCustom}
                templateAddon={
                  <AiTemplateDesigner
                    cardId={cardId}
                    design={custom}
                    templateDocument={templateDocument}
                    templateImageUrl={templateImageUrl}
                    onApply={applyAiDesign}
                    onBusyChange={setAiDesignBusy}
                    capturePreview={captureAiPreview}
                  />
                }
                onExport={handleExport} exporting={exporting}
                exportSize={exportSize} setExportSize={setExportSize}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Preview sheet */}
      <PreviewSheet open={sheetOpen} onClose={() => setSheetOpen(false)} {...badgeProps}
        templateDocument={templateDocument}
        templateImageUrl={templateImageUrl}
        onExport={handleExport} exporting={exporting} />
    </div>
  );
}
