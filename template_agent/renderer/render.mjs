import { chromium } from "playwright";

const input = await new Promise((resolve, reject) => {
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { data += chunk; });
  process.stdin.on("end", () => resolve(data));
  process.stdin.on("error", reject);
});
const source = JSON.parse(input);
const widthMm = Number(source.width_mm);
const heightMm = Number(source.height_mm);
if (!Number.isInteger(widthMm) || !Number.isInteger(heightMm) || widthMm < 20 || widthMm > 200 || heightMm < 20 || heightMm > 200) {
  throw new Error("invalid badge dimensions");
}
const portraitPlaceholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Crect width='100%25' height='100%25' fill='%23dbe5ef'/%3E%3Ccircle cx='120' cy='88' r='42' fill='%2391a4b8'/%3E%3Cpath d='M35 220c12-54 48-76 85-76s73 22 85 76' fill='%2371869d'/%3E%3C/svg%3E";
const sample = source.html
  .replaceAll(/{{\s*card\.portrait_url\s*}}/g, portraitPlaceholder)
  .replaceAll(/{{\s*card\.[\w_]+\s*}}/g, "示例文本")
  .replaceAll(/{{\s*assets\.[\w_]+\s*}}/g, portraitPlaceholder)
  .replaceAll(/{{\s*fields\.[\w_]+\s*}}/g, "示例信息");
const document = `<!doctype html><html><head><meta charset="utf-8"><style>
${source.css}
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;width:${widthMm}mm;height:${heightMm}mm;overflow:hidden}
body{width:${widthMm}mm !important;height:${heightMm}mm !important;background:#fff;overflow:hidden !important}
main[data-badge-root]{position:relative;width:100% !important;height:100% !important;overflow:hidden !important;box-sizing:border-box !important}
main[data-badge-root]>*:first-child{box-sizing:border-box !important;max-width:100% !important;max-height:100% !important;overflow:hidden !important}
</style></head><body><main data-badge-root>${sample}</main></body></html>`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: Math.ceil(widthMm * 3.78), height: Math.ceil(heightMm * 3.78) },
  javaScriptEnabled: false,
});
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
await page.setContent(document, { waitUntil: "load", timeout: 15_000 });
const measurements = await page.evaluate(() => {
  const root = document.querySelector("[data-badge-root]");
  const body = document.body;
  const rect = root?.getBoundingClientRect();
  const isVisible = (element) => {
    const style = window.getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
  };
  const color = (value) => {
    const values = value.match(/rgba?\(([^)]+)\)/)?.[1]?.split(",").map(Number);
    return values && values.length >= 3 ? values : null;
  };
  const luminance = ([red, green, blue]) => {
    const channel = (value) => {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
  };
  const background = (element) => {
    let current = element;
    while (current) {
      const value = color(window.getComputedStyle(current).backgroundColor);
      if (value && (value[3] === undefined || value[3] >= 0.99)) return value;
      current = current.parentElement;
    }
    return [255, 255, 255];
  };
  const candidates = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span,strong,small,li,img")]
    .filter(isVisible)
    .slice(0, 80)
    .map((element, index) => {
      const box = element.getBoundingClientRect();
      return { element, index, tag: element.tagName.toLowerCase(), text: element.textContent?.trim().slice(0, 80) || "", box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height } };
    });
  const overlaps = [];
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      const a = candidates[left];
      const b = candidates[right];
      if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
      const width = Math.max(0, Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left));
      const height = Math.max(0, Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top));
      const area = width * height;
      if (area > 16 && area / Math.min(a.box.width * a.box.height, b.box.width * b.box.height) > 0.12) {
        overlaps.push({ first: a.index, second: b.index, area: Math.round(area) });
      }
    }
  }
  const lowContrast = candidates
    .filter((candidate) => candidate.text.length > 0)
    .map((candidate) => {
      const foreground = color(window.getComputedStyle(candidate.element).color);
      const backdrop = background(candidate.element);
      if (!foreground) return null;
      const ratio = (Math.max(luminance(foreground), luminance(backdrop)) + 0.05) / (Math.min(luminance(foreground), luminance(backdrop)) + 0.05);
      return ratio < 3 ? { index: candidate.index, ratio: Math.round(ratio * 100) / 100, text: candidate.text } : null;
    })
    .filter(Boolean);
  const lowResolutionImages = candidates
    .filter((candidate) => candidate.tag === "img")
    .map((candidate) => ({ candidate, naturalWidth: candidate.element.naturalWidth, naturalHeight: candidate.element.naturalHeight }))
    .filter(({ candidate, naturalWidth, naturalHeight }) => naturalWidth > 0 && naturalHeight > 0 && (naturalWidth < candidate.box.width * 1.25 || naturalHeight < candidate.box.height * 1.25))
    .map(({ candidate, naturalWidth, naturalHeight }) => ({ index: candidate.index, natural_width: naturalWidth, natural_height: naturalHeight, display_width: Math.round(candidate.box.width), display_height: Math.round(candidate.box.height) }));
  return {
    root_width: Math.round(rect?.width || 0),
    root_height: Math.round(rect?.height || 0),
    body_scroll_width: body.scrollWidth,
    body_scroll_height: body.scrollHeight,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    overflow_x: body.scrollWidth > window.innerWidth,
    overflow_y: body.scrollHeight > window.innerHeight,
    overlaps: overlaps.slice(0, 20),
    low_contrast_text: lowContrast.slice(0, 20),
    low_resolution_images: lowResolutionImages.slice(0, 20),
  };
});
const screenshot = await page.screenshot({ type: "png" });
await browser.close();
process.stdout.write(JSON.stringify({
  screenshot_png_base64: screenshot.toString("base64"),
  diagnostics: { ...measurements, console_errors: consoleErrors.slice(0, 10) },
}));
