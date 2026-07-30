// 把工牌导出成 PNG 下载。
//
// 不直接截预览区那个节点：它套在缩放视口里（transform: scale），
// 自身还带 drop-shadow 滤镜和入场动画。html2canvas 对祖先 transform
// 的处理有缺陷，滤镜也常让画布整片空白 —— 实测导出就是一张白图。
// 改成把工牌重新渲染一份到离屏容器，无变换、无滤镜，再截那一份。

import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";
import html2canvas from "html2canvas";

/** 导出倍率。2 倍在常见打印尺寸下足够清晰，再高文件体积增长很快。 */
const DEFAULT_SCALE = 2;

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportError";
  }
}

/** 文件名里不能出现的字符，统一换成下划线。 */
function safeFileName(raw: string): string {
  const cleaned = raw.trim().replace(/[\\/:*?"<>|]/g, "_");
  return cleaned || "badge";
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFileName(name)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立刻 revoke 会让部分浏览器拿不到数据，下一帧再释放。
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/** 等容器内所有 <img> 解码完毕。失败的不造成导出失败 ——
    宁可缺张照片，也不要整个工牌导不出来。 */
async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise<void>(resolve => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
    });
  }));
  // 解码完到可绘制中间还差一拍，再让一帧。
  await new Promise(r => requestAnimationFrame(r));
}

/** 把容器内的图片换成 data URI。失败就保留原 URL ——
    html2canvas 自己还有一次机会，不在这里提前放弃。 */
async function inlineImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(imgs.map(async img => {
    if (img.src.startsWith("data:")) return;
    try {
      const res = await fetch(img.src, { credentials: "same-origin" });
      if (!res.ok) return;
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
      img.src = dataUrl;
      // 换了 src 要重新等一次解码。
      if (!(img.complete && img.naturalWidth > 0)) {
        await new Promise<void>(resolve => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        });
      }
    } catch {
      // 网络或 CORS 失败，保留原 src。
    }
  }));
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new ExportError("生成图片失败");
  return blob;
}

/**
 * 把 React 元素渲染到离屏容器后导出 PNG。
 *
 * @param element 工牌元素，通常是一个 <BadgeCard>
 * @param name    文件名主干，不含扩展名
 * @param scale   像素倍率，默认 2
 */
export async function exportElementToPng(
  element: ReactElement,
  name: string,
  scale: number = DEFAULT_SCALE,
): Promise<void> {
  // 放在视口外而不是 display:none —— 隐藏元素量不到尺寸，截出来是 0×0。
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff;";
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(element);
    // 等 React 提交 DOM，并给字体和证件照留一帧加载时间。
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await document.fonts?.ready;
    // 还要等证件照真正解码完。只等帧和字体的话，html2canvas 截图时
    // <img> 还在下载，头像位置就是一圈空的。
    await waitForImages(host);
    // html2canvas 会克隆 DOM 并重新请求图片。同源代理 URL 可能带认证，
    // 第二次请求会失败。改成先转 data URI 内联到 DOM，后续就不用再请求。
    await inlineImages(host);

    const target = host.firstElementChild as HTMLElement | null;
    if (!target) throw new ExportError("工牌渲染失败");

    const canvas = await html2canvas(target, {
      scale,
      backgroundColor: "#fff",
      useCORS: true,
      logging: false,
    });
    triggerDownload(await canvasToBlob(canvas), name);
  } finally {
    root.unmount();
    host.remove();
  }
}
