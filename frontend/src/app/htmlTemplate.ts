export interface HtmlTemplateDocument {
  html: string;
  css: string;
}

const DOCUMENT_KEYS = ["html", "css"] as const;
const MAX_PART_BYTES = 32 * 1024;
const MAX_DOCUMENT_BYTES = 48 * 1024;

function byteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * API 响应仍是不可信输入。后端会做完整 HTML/CSS 语法清洗，这里再校验
 * 精确对象形状与体积；真正渲染时还会放进禁脚本、禁联网的 sandbox iframe。
 */
export function isHtmlTemplateDocument(
  value: unknown,
): value is HtmlTemplateDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (
    keys.length !== DOCUMENT_KEYS.length ||
    keys.some((key) => !DOCUMENT_KEYS.includes(key as (typeof DOCUMENT_KEYS)[number]))
  ) {
    return false;
  }
  if (
    typeof candidate.html !== "string" ||
    typeof candidate.css !== "string" ||
    !candidate.html.trim()
  ) {
    return false;
  }

  const htmlBytes = byteLength(candidate.html);
  const cssBytes = byteLength(candidate.css);
  return (
    htmlBytes <= MAX_PART_BYTES &&
    cssBytes <= MAX_PART_BYTES &&
    htmlBytes + cssBytes <= MAX_DOCUMENT_BYTES
  );
}
