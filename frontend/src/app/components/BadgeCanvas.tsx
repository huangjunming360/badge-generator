import type { ReactNode } from "react";

// 实物挂牌画布。
//
// 设计稿的四个模板尺寸是像素写死的（竖版 200×300，横版 320×190），
// 比例 2:3 与实物挂牌的 55:85（11:17）并不相等。这里的做法是：
// 外层用 mm 定义真实画布，内层把设计稿内容整体等比缩放后居中放进去。
// 版式因此不会变形，代价是两种比例的差额会体现为上下留白。
//
// 缩放用 transform 而非 zoom：这里外层尺寸已由 mm 固定，
// 不需要内容参与外部布局，transform 的合成层性能也更好。

interface Props {
  widthMm: number;
  heightMm: number;
  // 设计稿内容的像素尺寸，用于算等比缩放系数。
  contentWidth: number;
  contentHeight: number;
  // 屏幕预览倍数。仅影响显示大小，不改变 mm 物理尺寸。
  previewScale?: number;
  children: ReactNode;
}

// 浏览器按固定 96dpi 换算 mm，与真实屏幕 PPI 无关，
// 所以屏幕上的 55mm 不等于手里量到的 55mm。打印时才是准的。
const MM_TO_PX = 96 / 25.4;

export function BadgeCanvas({
  widthMm, heightMm, contentWidth, contentHeight, previewScale = 1, children,
}: Props) {
  const canvasW = widthMm * MM_TO_PX;
  const canvasH = heightMm * MM_TO_PX;

  // 取较小的一边作为系数，保证内容完整放进画布且不变形。
  const fit = Math.min(canvasW / contentWidth, canvasH / contentHeight);

  return (
    <div
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        transform: previewScale === 1 ? undefined : `scale(${previewScale})`,
        transformOrigin: "center center",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
      }}
      data-badge-canvas
      data-width-mm={widthMm}
      data-height-mm={heightMm}
    >
      <div
        style={{
          width: contentWidth,
          height: contentHeight,
          transform: `scale(${fit})`,
          transformOrigin: "center center",
          flexShrink: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// 各模板设计稿的原始像素尺寸，供 BadgeCanvas 计算缩放系数。
// 与 shared.tsx 里 BadgeCard 写死的值对应（business 横版 320×190，
// visitor/access 竖版 200×300，custom 随 orientation 切换），
// 改那边的尺寸要同步这里。
const PORTRAIT_SIZE = { width: 200, height: 300 } as const;
const LANDSCAPE_SIZE = { width: 320, height: 190 } as const;

export function templateContentSize(
  template: "visitor" | "access" | "business" | "custom",
  orientation: "portrait" | "landscape" = "portrait",
  // 字号高度补偿。BadgeCard 会按同一个系数把卡片撑高，
  // 这里不跟着进的话等比缩放会算错，版式就错位了。
  heightFactor = 1,
) {
  const base = isLandscapeTemplate(template, orientation) ? LANDSCAPE_SIZE : PORTRAIT_SIZE;
  // 横版名片没有底部二维码区，不需要补高。
  if (isLandscapeTemplate(template, orientation)) return base;
  return { width: base.width, height: base.height * heightFactor };
}

// 横版模板要配横版画布，否则把 320×190 的内容塞进 55×85mm 竖画布，
// 等比缩放后纵向会空掉 6 成，看着就是一张小卡飘在留白里。
export function isLandscapeTemplate(
  template: "visitor" | "access" | "business" | "custom",
  orientation: "portrait" | "landscape" = "portrait",
) {
  if (template === "business") return true;
  return template === "custom" && orientation === "landscape";
}

// 把用户设定的 mm 尺寸按模板方向摆正：横版时宽高互换。
export function canvasSizeMm(
  widthMm: number, heightMm: number,
  template: "visitor" | "access" | "business" | "custom",
  orientation: "portrait" | "landscape" = "portrait",
) {
  const landscape = isLandscapeTemplate(template, orientation);
  const shortSide = Math.min(widthMm, heightMm);
  const longSide = Math.max(widthMm, heightMm);

  return landscape
    ? { widthMm: longSide, heightMm: shortSide }
    : { widthMm: shortSide, heightMm: longSide };
}
