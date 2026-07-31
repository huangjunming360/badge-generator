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

async function renderElementToCanvas(
  element: ReactElement,
  scale: number,
): Promise<HTMLCanvasElement> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff;";
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    root.render(element);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await document.fonts?.ready;
    await waitForImages(host);
    await inlineImages(host);

    const target = host.firstElementChild as HTMLElement | null;
    if (!target) throw new ExportError("工牌渲染失败");

    const templateFrame = target.querySelector<HTMLIFrameElement>(
      "iframe[data-html-template-frame]",
    );
    const captureTarget = templateFrame
      ? await iframeBadgeRoot(templateFrame)
      : target;

    await captureTarget.ownerDocument.fonts?.ready;
    await waitForImages(captureTarget);
    await inlineImages(captureTarget);

    return await html2canvas(captureTarget, {
      scale,
      backgroundColor: "#fff",
      useCORS: true,
      logging: false,
    });
  } finally {
    root.unmount();
    host.remove();
  }
}

async function iframeBadgeRoot(frame: HTMLIFrameElement): Promise<HTMLElement> {
  // iframe 挂载后的初始 about:blank 也会报告 readyState=complete，不能只看
  // readyState，否则 srcDoc 尚未提交时会偶发取得空文档。直接等可信根节点出现。
  const root = await new Promise<HTMLElement>((resolve, reject) => {
    const startedAt = performance.now();
    const check = () => {
      try {
        const candidate =
          frame.contentDocument?.querySelector<HTMLElement>(
            "[data-badge-root]",
          );
        if (
          candidate &&
          frame.contentDocument?.readyState === "complete"
        ) {
          resolve(candidate);
          return;
        }
      } catch {
        reject(new ExportError("HTML 模板沙箱不可访问"));
        return;
      }

      if (performance.now() - startedAt >= 5_000) {
        reject(new ExportError("HTML 模板加载超时"));
        return;
      }
      requestAnimationFrame(check);
    };
    frame.addEventListener(
      "error",
      () => reject(new ExportError("HTML 模板加载失败")),
      { once: true },
    );
    check();
  });

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
  return root;
}

/** 供 AI 视觉复审使用：渲染真实 BadgeCard，但不触发下载。 */
export async function renderElementToDataUrl(
  element: ReactElement,
  scale: number = DEFAULT_SCALE,
): Promise<string> {
  const canvas = await renderElementToCanvas(element, scale);
  return canvas.toDataURL("image/jpeg", 0.88);
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
  const canvas = await renderElementToCanvas(element, scale);
  triggerDownload(await canvasToBlob(canvas), name);
}
