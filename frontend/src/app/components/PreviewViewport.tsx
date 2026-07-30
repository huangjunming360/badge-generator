// 工牌预览视口：滚轮缩放 + 拖拽平移。
//
// 缩放作用在包裹层而非 BadgeCanvas 内部 —— 画布的 mm 尺寸是物理量，
// 不能被预览行为改写，否则导出和打印尺寸会跟着变。这里只动视觉呈现。

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;
// 滚轮一格的缩放比例。用乘法而非加法，缩放手感在各倍率下才一致。
const WHEEL_STEP = 1.0015;

export interface ViewportState {
  zoom: number;
  x: number;
  y: number;
}

const IDENTITY: ViewportState = { zoom: 1, x: 0, y: 0 };

function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function usePreviewViewport() {
  const [view, setView] = useState<ViewportState>(IDENTITY);
  const reset = useCallback(() => setView(IDENTITY), []);
  const zoomBy = useCallback((factor: number) => {
    setView(v => ({ ...v, zoom: clampZoom(v.zoom * factor) }));
  }, []);
  return { view, setView, reset, zoomBy };
}

export function PreviewViewport({
  view, setView, children,
}: {
  view: ViewportState;
  setView: React.Dispatch<React.SetStateAction<ViewportState>>;
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // 滚轮缩放要以指针位置为锚点，否则缩放时内容会往容器中心跑。
  // React 的 onWheel 是 passive 的，preventDefault 无效，只能手动挂原生监听。
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = host.getBoundingClientRect();
      // 指针相对容器中心的偏移 —— transformOrigin 是 center。
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;

      setView(v => {
        const next = clampZoom(v.zoom * Math.pow(WHEEL_STEP, -e.deltaY));
        if (next === v.zoom) return v;
        const k = next / v.zoom;
        // 让锚点在缩放前后落在同一个屏幕位置。
        return { zoom: next, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
      });
    };

    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [setView]);

  const onPointerDown = (e: React.PointerEvent) => {
    // 只接左键/主指针，右键留给浏览器菜单。
    if (e.button !== 0) return;
    dragRef.current = { px: e.clientX, py: e.clientY, ox: view.x, oy: view.y };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setView(v => ({ ...v, x: d.ox + (e.clientX - d.px), y: d.oy + (e.clientY - d.py) }));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      ref={hostRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        position: "relative", flex: 1, width: "100%",
        overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: dragging ? "grabbing" : "grab",
        // 触屏上禁掉浏览器自身的手势，交给指针事件处理。
        touchAction: "none",
      }}
    >
      <div style={{
        transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
        transformOrigin: "center center",
        // 拖拽时去掉过渡，否则跟手会有延迟感。
        transition: dragging ? "none" : "transform .12s ease-out",
        willChange: "transform",
      }}>
        {children}
      </div>
    </div>
  );
}

export { MIN_ZOOM, MAX_ZOOM, clampZoom };
