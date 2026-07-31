import { forwardRef, useMemo } from "react";
import {
  resolveCustomTemplateSize,
  type CustomTemplateDesign,
} from "../customTemplate";
import type { HtmlTemplateDocument } from "../htmlTemplate";
import type { Field } from "./shared";

const TEXT_SLOTS = [
  "name",
  "name_en",
  "organization",
  "host_organization",
  "host_department",
  "event_topic",
  "event_topic_en",
  "headerLabel",
  "subLabel",
] as const;

const NODE_SLOTS = new Set([
  "portrait",
  "qr",
  "barcode",
  "access_dots",
  "reference_image",
  "selected_fields",
]);

const SLOT_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

function svgElement(document: Document, name: string) {
  return document.createElementNS("http://www.w3.org/2000/svg", name);
}

function createQr(document: Document, color: string) {
  const wrapper = document.createElement("span");
  wrapper.className = "ai-slot ai-slot-qr";
  wrapper.dataset.slot = "qr";

  const svg = svgElement(document, "svg");
  svg.setAttribute("viewBox", "0 0 17 17");
  svg.setAttribute("aria-hidden", "true");
  const squares = [
    [0, 0],
    [12, 0],
    [0, 12],
  ];
  for (const [x, y] of squares) {
    const outer = svgElement(document, "rect");
    outer.setAttribute("x", String(x + 0.35));
    outer.setAttribute("y", String(y + 0.35));
    outer.setAttribute("width", "4.3");
    outer.setAttribute("height", "4.3");
    outer.setAttribute("rx", ".45");
    outer.setAttribute("fill", "none");
    outer.setAttribute("stroke", color);
    outer.setAttribute("stroke-width", ".7");
    svg.appendChild(outer);

    const inner = svgElement(document, "rect");
    inner.setAttribute("x", String(x + 1.5));
    inner.setAttribute("y", String(y + 1.5));
    inner.setAttribute("width", "2");
    inner.setAttribute("height", "2");
    inner.setAttribute("rx", ".25");
    inner.setAttribute("fill", color);
    svg.appendChild(inner);
  }
  const dots = [
    [7, 1], [7, 4], [7, 7], [7, 10], [8, 14], [9, 5], [9, 9],
    [10, 12], [11, 7], [12, 9], [12, 13], [14, 6], [14, 10],
    [15, 14], [16, 8], [16, 12], [16, 16],
  ];
  for (const [x, y] of dots) {
    const dot = svgElement(document, "rect");
    dot.setAttribute("x", String(x));
    dot.setAttribute("y", String(y));
    dot.setAttribute("width", ".9");
    dot.setAttribute("height", ".9");
    dot.setAttribute("rx", ".18");
    dot.setAttribute("fill", color);
    svg.appendChild(dot);
  }
  wrapper.appendChild(svg);
  return wrapper;
}

function createBarcode(document: Document, color: string) {
  const wrapper = document.createElement("span");
  wrapper.className = "ai-slot ai-slot-barcode";
  wrapper.dataset.slot = "barcode";
  const svg = svgElement(document, "svg");
  svg.setAttribute("viewBox", "0 0 58 18");
  svg.setAttribute("aria-hidden", "true");

  const widths = [2, 1, 3, 1, 2, 2, 1, 3, 1, 2, 1, 3, 2, 1, 2];
  let cursor = 0;
  widths.forEach((width, index) => {
    if (index % 2 === 0) {
      const bar = svgElement(document, "rect");
      bar.setAttribute("x", String(cursor));
      bar.setAttribute("y", "0");
      bar.setAttribute("width", String(width));
      bar.setAttribute("height", "18");
      bar.setAttribute("fill", color);
      svg.appendChild(bar);
    }
    cursor += width + 1.5;
  });
  wrapper.appendChild(svg);
  return wrapper;
}

function createAccessDots(
  document: Document,
  color: string,
  mutedColor: string,
) {
  const wrapper = document.createElement("span");
  wrapper.className = "ai-slot ai-slot-access-dots";
  wrapper.dataset.slot = "access_dots";
  for (let index = 0; index < 4; index += 1) {
    const dot = document.createElement("i");
    dot.style.background = index < 3 ? color : mutedColor;
    wrapper.appendChild(dot);
  }
  return wrapper;
}

function createPortrait(
  document: Document,
  portraitUrl: string | null | undefined,
) {
  const wrapper = document.createElement("span");
  wrapper.className = "ai-slot ai-slot-portrait";
  wrapper.dataset.slot = "portrait";
  if (portraitUrl) {
    const image = document.createElement("img");
    image.src = portraitUrl;
    image.alt = "";
    wrapper.appendChild(image);
  } else {
    const fallback = document.createElement("span");
    fallback.className = "ai-slot-portrait-fallback";
    fallback.textContent = "人";
    wrapper.appendChild(fallback);
  }
  return wrapper;
}

function createReferenceImage(document: Document, imageUrl: string) {
  const wrapper = document.createElement("span");
  wrapper.className = "ai-slot ai-slot-reference-image";
  wrapper.dataset.slot = "reference_image";
  const image = document.createElement("img");
  image.src = imageUrl;
  image.alt = "";
  wrapper.appendChild(image);
  return wrapper;
}

function createSelectedFields(document: Document, fields: Field[]) {
  const list = document.createElement("div");
  list.className = "ai-slot ai-slot-selected-fields";
  list.dataset.slot = "selected_fields";
  for (const field of fields) {
    const row = document.createElement("div");
    row.className = "ai-field";
    row.dataset.fieldKey = field.key;

    const label = document.createElement("span");
    label.className = "ai-field-label";
    label.textContent = field.label;
    const value = document.createElement("span");
    value.className = "ai-field-value";
    value.textContent = field.value;
    row.append(label, value);
    list.appendChild(row);
  }
  return list;
}

function nodeSlot(
  name: string,
  document: Document,
  fields: Field[],
  design: CustomTemplateDesign,
  portraitUrl: string | null | undefined,
  templateImageUrl: string | null | undefined,
): Node | null {
  if (name === "portrait") {
    return design.showPhoto ? createPortrait(document, portraitUrl) : null;
  }
  if (name === "qr") {
    return design.showQR ? createQr(document, design.textColor) : null;
  }
  if (name === "barcode") {
    return design.showBarcode ? createBarcode(document, design.textColor) : null;
  }
  if (name === "access_dots") {
    return design.showDots
      ? createAccessDots(document, design.primaryColor, design.mutedColor)
      : null;
  }
  if (name === "reference_image") {
    return templateImageUrl
      ? createReferenceImage(document, templateImageUrl)
      : null;
  }
  if (name === "selected_fields") {
    return createSelectedFields(document, fields);
  }
  return null;
}

function fillTemplate(
  template: HtmlTemplateDocument,
  fields: Field[],
  design: CustomTemplateDesign,
  portraitUrl: string | null | undefined,
  templateImageUrl: string | null | undefined,
) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(
    `<!doctype html><html><body>${template.html}</body></html>`,
    "text/html",
  );
  const selectedFields = fields.filter((field) => field.selected);
  const values = Object.fromEntries(
    selectedFields.map((field) => [field.key, field.value]),
  ) as Record<string, string>;
  values.headerLabel = design.headerLabel;
  values.subLabel = design.subLabel;

  const walker = parsed.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  for (const textNode of textNodes) {
    const standalone = textNode.data.trim().match(
      /^\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}$/,
    );
    if (standalone && NODE_SLOTS.has(standalone[1])) {
      const replacement = nodeSlot(
        standalone[1],
        parsed,
        selectedFields,
        design,
        portraitUrl,
        templateImageUrl,
      );
      if (replacement) textNode.replaceWith(replacement);
      else textNode.remove();
      continue;
    }

    textNode.data = textNode.data.replace(
      SLOT_PATTERN,
      (_token, name: string) =>
        TEXT_SLOTS.includes(name as (typeof TEXT_SLOTS)[number])
          ? values[name] ?? ""
          : "",
    );
  }

  const root = parsed.createElement("div");
  root.setAttribute("data-badge-root", "");
  while (parsed.body.firstChild) root.appendChild(parsed.body.firstChild);
  parsed.body.appendChild(root);
  return root.outerHTML;
}

function buildSourceDocument(
  template: HtmlTemplateDocument,
  fields: Field[],
  design: CustomTemplateDesign,
  portraitUrl: string | null | undefined,
  templateImageUrl: string | null | undefined,
  width: number,
  height: number,
) {
  const content = fillTemplate(
    template,
    fields,
    design,
    portraitUrl,
    templateImageUrl,
  );
  const csp = [
    "default-src 'none'",
    "script-src 'none'",
    "style-src 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'none'",
    "object-src 'none'",
    "frame-src 'self'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
  const baseCss = `
    html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
    *, *::before, *::after { box-sizing: border-box; }
    .ai-slot { box-sizing: border-box; }
    .ai-slot-portrait {
      display: inline-grid; width: 64px; height: 64px; overflow: hidden;
      place-items: center; border-radius: 50%; background: #e8edf3;
    }
    .ai-slot-portrait img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .ai-slot-portrait-fallback { font: 700 28px/1 sans-serif; }
    .ai-slot-reference-image { display: inline-block; overflow: hidden; }
    .ai-slot-reference-image img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .ai-slot-qr { display: inline-block; width: 44px; height: 44px; }
    .ai-slot-qr svg, .ai-slot-barcode svg { display: block; width: 100%; height: 100%; }
    .ai-slot-barcode { display: inline-block; width: 58px; height: 18px; }
    .ai-slot-access-dots { display: inline-flex; gap: 3px; align-items: center; }
    .ai-slot-access-dots > i { display: block; width: 5px; height: 5px; border-radius: 50%; }
    .ai-slot-selected-fields { display: grid; gap: 5px; }
    .ai-field { display: grid; gap: 2px; min-width: 0; }
    .ai-field-label { font-size: .72em; opacity: .68; }
    .ai-field-value { overflow-wrap: anywhere; }
  `;
  const hostCss = `
    body > [data-badge-root] {
      display: block !important;
      position: relative !important;
      width: ${width}px !important;
      height: ${height}px !important;
      min-width: ${width}px !important;
      min-height: ${height}px !important;
      max-width: ${width}px !important;
      max-height: ${height}px !important;
      margin: 0 !important;
      overflow: hidden !important;
      isolation: isolate !important;
    }
  `;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <style>${baseCss}</style>
  <style>${template.css}</style>
  <style>${hostCss}</style>
</head>
<body>${content}</body>
</html>`;
}

export interface HtmlBadgeProps {
  fields: Field[];
  design: CustomTemplateDesign;
  templateDocument: HtmlTemplateDocument;
  portraitUrl?: string | null;
  templateImageUrl?: string | null;
  scale?: number;
  watermark?: string;
}

export const HtmlBadge = forwardRef<HTMLDivElement, HtmlBadgeProps>(
  function HtmlBadge(
    {
      fields,
      design,
      templateDocument,
      portraitUrl,
      templateImageUrl,
      scale = 1,
      watermark,
    },
    ref,
  ) {
    const selectedFieldCount = fields.filter((field) => field.selected).length;
    const { width, height } = resolveCustomTemplateSize(
      design,
      selectedFieldCount,
    );
    const srcDoc = useMemo(
      () =>
        buildSourceDocument(
          templateDocument,
          fields,
          design,
          portraitUrl,
          templateImageUrl,
          width,
          height,
        ),
      [
        templateDocument,
        fields,
        design,
        portraitUrl,
        templateImageUrl,
        width,
        height,
      ],
    );

    return (
      <div
        ref={ref}
        data-html-template-preview
        style={{
          position: "relative",
          width: width * scale,
          height: height * scale,
          flexShrink: 0,
        }}
      >
        <iframe
          data-html-template-frame
          title="AI 设计工牌"
          sandbox="allow-same-origin"
          srcDoc={srcDoc}
          tabIndex={-1}
          style={{
            display: "block",
            width,
            height,
            border: 0,
            overflow: "hidden",
            pointerEvents: "none",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            background: "transparent",
          }}
        />
        {watermark && (
          <div
            data-ai-design-watermark
            style={{
              position: "absolute",
              right: 6 * scale,
              bottom: 5 * scale,
              zIndex: 2,
              maxWidth: `calc(100% - ${12 * scale}px)`,
              padding: `${2 * scale}px ${4 * scale}px`,
              border: "1px solid rgba(255,255,255,.5)",
              borderRadius: 4 * scale,
              background: "rgba(20,35,55,.64)",
              color: "#fff",
              fontSize: 5.5 * scale,
              fontWeight: 650,
              lineHeight: 1.2,
              letterSpacing: ".04em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {watermark}
          </div>
        )}
      </div>
    );
  },
);
