import { useEffect, useRef, useState } from "react";
import {
  Bot,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { ApiError } from "../../api/client";
import {
  requestTemplateDesign,
  type TemplateDesignHistoryEntry,
  type TemplateDesignPhase,
} from "../../api/templateDesigns";
import type { CustomTemplateDesign } from "../customTemplate";
import type { HtmlTemplateDocument } from "../htmlTemplate";

const MAX_DISPLAY_HISTORY = 200;
const MAX_UNDO_STEPS = 8;
const MIN_REVIEW_PASSES = 2;
const MAX_REVIEW_PASSES = 100;
const MAX_REFERENCE_IMAGE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 90_000;
const REFERENCE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

interface ReferenceImage {
  dataUrl: string;
  name: string;
}

interface DesignerHistoryEntry extends TemplateDesignHistoryEntry {
  referenceImage?: ReferenceImage;
}

interface DesignCheckpoint {
  design: CustomTemplateDesign;
  document: HtmlTemplateDocument | null;
  templateImageUrl: string | null;
  history: DesignerHistoryEntry[];
}

export interface AiTemplateDesignerProps {
  cardId: number | null;
  design: CustomTemplateDesign;
  templateDocument: HtmlTemplateDocument | null;
  templateImageUrl: string | null;
  onApply: (
    design: CustomTemplateDesign,
    document: HtmlTemplateDocument | null,
    templateImageUrl: string | null,
  ) => void | Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  capturePreview: (
    design: CustomTemplateDesign,
    document: HtmlTemplateDocument | null,
    templateImageUrl: string | null,
  ) => Promise<string | Blob>;
}

function limitHistory(history: DesignerHistoryEntry[]) {
  return history.slice(-MAX_DISPLAY_HISTORY);
}

function waitForTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("读取预览失败"));
    reader.readAsDataURL(blob);
  });
}

async function previewAsString(
  capturePreview: AiTemplateDesignerProps["capturePreview"],
  design: CustomTemplateDesign,
  document: HtmlTemplateDocument | null,
  templateImageUrl: string | null,
) {
  const preview = await capturePreview(design, document, templateImageUrl);
  const value =
    typeof preview === "string" ? preview : await blobToDataUrl(preview);
  if (!value.trim()) throw new Error("没有取得预览图片");
  return value;
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) return error.message;
  return "AI 设计失败，请稍后重试";
}

export default function AiTemplateDesigner({
  cardId,
  design,
  templateDocument,
  templateImageUrl,
  onApply,
  onBusyChange,
  capturePreview,
}: AiTemplateDesignerProps) {
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<DesignerHistoryEntry[]>([]);
  const [activePhase, setActivePhase] = useState<TemplateDesignPhase | null>(
    null,
  );
  const [reviewPass, setReviewPass] = useState(0);
  const [checkpoints, setCheckpoints] = useState<DesignCheckpoint[]>([]);
  const [rollingBack, setRollingBack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceImage, setReferenceImage] =
    useState<ReferenceImage | null>(null);
  const [continuousReview, setContinuousReview] = useState(true);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const busy = activePhase !== null || rollingBack;
  const hasCard =
    typeof cardId === "number" && Number.isInteger(cardId) && cardId > 0;

  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  const send = async () => {
    const prompt = draft.trim();
    if (!hasCard || busy || !prompt) return;

    const previousHistory = limitHistory(history);
    const sentReferenceImage = referenceImage
      ? { ...referenceImage }
      : undefined;
    const userMessage: DesignerHistoryEntry = {
      role: "user",
      content: prompt,
      ...(sentReferenceImage
        ? { referenceImage: sentReferenceImage }
        : {}),
    };
    const historyWithUser = limitHistory([...previousHistory, userMessage]);
    const checkpoint: DesignCheckpoint = {
      design: { ...design },
      document: templateDocument ? { ...templateDocument } : null,
      templateImageUrl,
      history: previousHistory.map((message) => ({ ...message })),
    };
    const referenceImageDataUrl = sentReferenceImage?.dataUrl;
    const generatedTemplateImageUrl =
      referenceImageDataUrl ?? templateImageUrl;
    const reviewLimit = continuousReview ? MAX_REVIEW_PASSES : 1;
    const minimumReviewPasses = continuousReview ? MIN_REVIEW_PASSES : 1;

    setDraft("");
    setReferenceImage(null);
    if (referenceInputRef.current) referenceInputRef.current.value = "";
    setError(null);
    setHistory(historyWithUser);
    setActivePhase("generate");
    const abortController = new AbortController();
    let timedOut = false;
    let activeTimeoutId: number | null = null;
    abortControllerRef.current = abortController;

    const requestWithTimeout = async (
      request: Parameters<typeof requestTemplateDesign>[1],
    ) => {
      abortController.signal.throwIfAborted();
      timedOut = false;
      activeTimeoutId = window.setTimeout(() => {
        timedOut = true;
        abortController.abort();
      }, REQUEST_TIMEOUT_MS);

      try {
        return await requestTemplateDesign(
          cardId,
          request,
          abortController.signal,
        );
      } finally {
        if (activeTimeoutId !== null) {
          window.clearTimeout(activeTimeoutId);
          activeTimeoutId = null;
        }
      }
    };

    try {
      const generated = await requestWithTimeout({
        prompt,
        current_design: design,
        ...(templateDocument
          ? { current_document: templateDocument }
          : {}),
        history: previousHistory,
        phase: "generate",
        ...(referenceImageDataUrl
          ? { reference_image: referenceImageDataUrl }
          : {}),
      });
      const generatedDocument = generated.document ?? templateDocument;
      await onApply(
        generated.design,
        generatedDocument,
        generatedTemplateImageUrl,
      );
      setCheckpoints((current) =>
        [...current, checkpoint].slice(-MAX_UNDO_STEPS),
      );

      const generatedMessage: DesignerHistoryEntry = {
        role: "assistant",
        content: generated.message || "已生成一版设计。",
      };
      const historyWithGeneration = limitHistory([
        ...historyWithUser,
        generatedMessage,
      ]);
      setHistory(historyWithGeneration);

      // 同一份设计状态连续走“渲染 → 截图 → 复审 → 再渲染”闭环。
      // 连续模式保留多轮“渲染 → 截图 → 修正”。每次 API 请求独立计算
      // 90 秒超时，已完成的请求不会占用下一轮的时间预算。
      setActivePhase("review");
      let reviewedDesign = generated.design;
      let reviewedDocument = generatedDocument;
      let reviewedHistory = historyWithGeneration;

      for (let pass = 1; pass <= reviewLimit; pass += 1) {
        setReviewPass(pass);
        abortController.signal.throwIfAborted();
        await waitForTwoFrames();
        const previewImage = await previewAsString(
          capturePreview,
          reviewedDesign,
          reviewedDocument,
          generatedTemplateImageUrl,
        );
        abortController.signal.throwIfAborted();
        const reviewed = await requestWithTimeout({
          prompt,
          current_design: reviewedDesign,
          ...(reviewedDocument
            ? { current_document: reviewedDocument }
            : {}),
          history: reviewedHistory,
          phase: "review",
          preview_image: previewImage,
          ...(referenceImageDataUrl
            ? { reference_image: referenceImageDataUrl }
            : {}),
        });
        reviewedDesign = reviewed.design;
        reviewedDocument = reviewed.document ?? reviewedDocument;
        await onApply(
          reviewedDesign,
          reviewedDocument,
          generatedTemplateImageUrl,
        );
        reviewedHistory = limitHistory([
          ...reviewedHistory,
          {
            role: "assistant",
            content: reviewed.message || `已完成第 ${pass} 轮预览检查。`,
          },
        ]);
        setHistory(reviewedHistory);

        if (
          pass >= minimumReviewPasses &&
          reviewed.request_preview === false
        ) {
          break;
        }
      }
    } catch (caught) {
      setError(
        abortController.signal.aborted
          ? timedOut
            ? "单次 AI 响应超过 90 秒，已停止等待；当前设计已保留。"
            : "已停止本轮 AI 设计，当前结果已保留。"
          : errorMessage(caught),
      );
    } finally {
      if (activeTimeoutId !== null) window.clearTimeout(activeTimeoutId);
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      setActivePhase(null);
      setReviewPass(0);
    }
  };

  const rollback = async () => {
    const checkpoint = checkpoints.at(-1);
    if (!checkpoint || busy) return;

    setRollingBack(true);
    setError(null);
    try {
      await onApply(
        { ...checkpoint.design },
        checkpoint.document ? { ...checkpoint.document } : null,
        checkpoint.templateImageUrl,
      );
      setHistory(checkpoint.history.map((message) => ({ ...message })));
      setCheckpoints((current) => current.slice(0, -1));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setRollingBack(false);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      (event.nativeEvent as KeyboardEvent).isComposing
    ) {
      return;
    }
    event.preventDefault();
    void send();
  };

  const onReferenceImageChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!REFERENCE_IMAGE_TYPES.has(file.type)) {
      setError("参考图仅支持 JPEG、PNG 或 WebP");
      return;
    }
    if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
      setError("参考图不能超过 2MB");
      return;
    }

    try {
      const dataUrl = await blobToDataUrl(file);
      if (!dataUrl.startsWith(`data:${file.type};base64,`)) {
        throw new Error("参考图读取结果无效");
      }
      setReferenceImage({ dataUrl, name: file.name });
      setError(null);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <section
      aria-label="AI 模板设计"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 12,
        border: "1px solid #D8E5F2",
        borderRadius: 10,
        background: "#F8FBFF",
        color: "#1A2C40",
        fontFamily: "'Outfit', sans-serif",
      }}
    >
      <style>{`
        @keyframes ai-template-spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span
          style={{
            width: 25,
            height: 25,
            borderRadius: 7,
            display: "grid",
            placeItems: "center",
            background: "#D8E9F8",
            color: "#3A76C4",
          }}
        >
          <Sparkles size={13} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>AI 帮我设计</div>
          <div style={{ marginTop: 1, fontSize: 9.5, color: "#8AAABB" }}>
            描述风格，再通过对话逐步调整
          </div>
        </div>
        <button
          type="button"
          onClick={() => void rollback()}
          disabled={busy || checkpoints.length === 0}
          title="回退上一轮"
          aria-label="回退上一轮"
          style={{
            width: 27,
            height: 27,
            border: "1px solid #D8E5F2",
            borderRadius: 7,
            background: "#FFFFFF",
            color: "#8AAABB",
            cursor:
              busy || checkpoints.length === 0 ? "default" : "pointer",
            opacity: busy || checkpoints.length === 0 ? 0.45 : 1,
            display: "grid",
            placeItems: "center",
          }}
        >
          <RotateCcw size={12} />
        </button>
        <button
          type="button"
          onClick={() => {
            setHistory([]);
            setCheckpoints([]);
            setError(null);
          }}
          disabled={busy || history.length === 0}
          title="清空对话"
          aria-label="清空对话"
          style={{
            width: 27,
            height: 27,
            border: "1px solid #D8E5F2",
            borderRadius: 7,
            background: "#FFFFFF",
            color: "#8AAABB",
            cursor: busy || history.length === 0 ? "default" : "pointer",
            opacity: busy || history.length === 0 ? 0.45 : 1,
            display: "grid",
            placeItems: "center",
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {history.length > 0 && (
        <div
          aria-live="polite"
          style={{
            maxHeight: 190,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 7,
            paddingRight: 2,
          }}
        >
          {history.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              style={{
                alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%",
                padding: "7px 9px",
                borderRadius:
                  message.role === "user"
                    ? "9px 9px 3px 9px"
                    : "9px 9px 9px 3px",
                border: `1px solid ${message.role === "user" ? "#C9DFF5" : "#E2EAF3"}`,
                background: message.role === "user" ? "#EAF3FC" : "#FFFFFF",
                color: message.role === "user" ? "#1D4F8A" : "#4E718A",
                fontSize: 10.5,
                lineHeight: 1.55,
                overflowWrap: "anywhere",
                whiteSpace: "pre-wrap",
              }}
            >
              {message.role === "assistant" && (
                <Bot
                  size={11}
                  aria-hidden
                  style={{
                    marginRight: 5,
                    verticalAlign: "-2px",
                    color: "#3A76C4",
                  }}
                />
              )}
              {message.referenceImage && (
                <img
                  src={message.referenceImage.dataUrl}
                  alt={`参考图：${message.referenceImage.name}`}
                  title={message.referenceImage.name}
                  style={{
                    display: "block",
                    width: "100%",
                    maxWidth: 150,
                    maxHeight: 110,
                    marginBottom: 6,
                    border: "1px solid #C9DFF5",
                    borderRadius: 7,
                    background: "#FFFFFF",
                    objectFit: "cover",
                  }}
                />
              )}
              {message.content}
            </div>
          ))}
        </div>
      )}

      {busy && (
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 8px",
            borderRadius: 7,
            background: "#EDF4FD",
            color: "#3A76C4",
            fontSize: 10.5,
          }}
        >
          <LoaderCircle
            size={12}
            style={{ animation: "ai-template-spin .9s linear infinite" }}
          />
          {rollingBack
            ? "正在回退上一轮…"
            : activePhase === "review"
              ? `第 ${reviewPass}/${continuousReview ? MAX_REVIEW_PASSES : 1} 轮查看预览并调整…`
              : "构思设计方案…"}
          {!rollingBack && activePhase && (
            <button
              type="button"
              onClick={() => abortControllerRef.current?.abort()}
              title="停止本轮 AI 设计"
              style={{
                marginLeft: "auto",
                border: "none",
                borderRadius: 6,
                padding: "3px 6px",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "#FFFFFF",
                color: "#3A76C4",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <Square size={9} fill="currentColor" />
              停止
            </button>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            padding: "7px 8px",
            border: "1px solid #F0D4DA",
            borderRadius: 7,
            background: "#FDF0F2",
            color: "#8A3448",
            fontSize: 10.5,
            lineHeight: 1.45,
          }}
        >
          {error}
        </div>
      )}

      {!hasCard && (
        <div
          style={{
            padding: "7px 8px",
            borderRadius: 7,
            background: "#FFF8E8",
            color: "#8A6A2F",
            fontSize: 10.5,
            lineHeight: 1.45,
          }}
        >
          请先完成资料解析并创建工牌，再使用 AI 设计。
        </div>
      )}

      {referenceImage && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 7px",
            border: "1px solid #D8E5F2",
            borderRadius: 8,
            background: "#FFFFFF",
          }}
        >
          <img
            src={referenceImage.dataUrl}
            alt=""
            style={{
              width: 34,
              height: 34,
              flexShrink: 0,
              borderRadius: 6,
              objectFit: "cover",
              background: "#EDF4FD",
            }}
          />
          <span
            title={referenceImage.name}
            style={{
              minWidth: 0,
              flex: 1,
              overflow: "hidden",
              color: "#4E718A",
              fontSize: 10.5,
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {referenceImage.name}
          </span>
          <button
            type="button"
            onClick={() => setReferenceImage(null)}
            disabled={busy}
            title="移除参考图"
            aria-label="移除参考图"
            style={{
              width: 24,
              height: 24,
              flexShrink: 0,
              border: "none",
              borderRadius: 6,
              display: "grid",
              placeItems: "center",
              background: "transparent",
              color: "#8AAABB",
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.45 : 1,
            }}
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 7,
          padding: 7,
          border: "1px solid #D8E5F2",
          borderRadius: 9,
          background: "#FFFFFF",
        }}
      >
        <input
          ref={referenceInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={!hasCard || busy}
          onChange={(event) => void onReferenceImageChange(event)}
          aria-label="选择设计参考图"
          style={{ display: "none" }}
        />
        <button
          type="button"
          onClick={() => referenceInputRef.current?.click()}
          disabled={!hasCard || busy}
          title="添加参考图（JPEG、PNG、WebP，最大 2MB）"
          aria-label="添加参考图"
          style={{
            width: 29,
            height: 29,
            flexShrink: 0,
            border: "none",
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            background: referenceImage ? "#D8E9F8" : "#EDF4FD",
            color: "#3A76C4",
            cursor: !hasCard || busy ? "default" : "pointer",
            opacity: !hasCard || busy ? 0.45 : 1,
          }}
        >
          <ImagePlus size={13} />
        </button>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={!hasCard || busy}
          rows={2}
          maxLength={2_000}
          placeholder="例如：做成简洁深蓝风，姓名更醒目"
          aria-label="描述模板设计要求"
          style={{
            minWidth: 0,
            flex: 1,
            resize: "none",
            border: "none",
            outline: "none",
            background: "transparent",
            color: "#1A2C40",
            font: "inherit",
            fontSize: 11,
            lineHeight: 1.45,
            opacity: !hasCard || busy ? 0.55 : 1,
          }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={!hasCard || busy || !draft.trim()}
          title="发送设计要求"
          aria-label="发送设计要求"
          style={{
            width: 29,
            height: 29,
            flexShrink: 0,
            border: "none",
            borderRadius: 8,
            display: "grid",
            placeItems: "center",
            background:
              !hasCard || busy || !draft.trim() ? "#D8E5F2" : "#3A76C4",
            color: "#FFFFFF",
            cursor: !hasCard || busy || !draft.trim() ? "default" : "pointer",
          }}
        >
          <Send size={13} />
        </button>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 5,
          fontSize: 9,
          color: "#B8CCDA",
          lineHeight: 1.4,
        }}
      >
        <span>Enter 发送 · Shift + Enter 换行 · 可附 1 张参考图</span>
        <button
          type="button"
          role="switch"
          aria-checked={continuousReview}
          disabled={busy}
          onClick={() => setContinuousReview((enabled) => !enabled)}
          style={{
            width: "100%",
            minHeight: 38,
            padding: "7px 9px",
            border: "1px solid #C9DFF5",
            borderRadius: 9,
            background: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            color: "#1A2C40",
            cursor: busy ? "default" : "pointer",
            font: "inherit",
            fontSize: 10.5,
            opacity: busy ? 0.55 : 1,
          }}
        >
          <span>连续优化（最多 {MAX_REVIEW_PASSES} 轮）</span>
          <span
            aria-hidden
            style={{
              position: "relative",
              width: 32,
              height: 18,
              flexShrink: 0,
              borderRadius: 999,
              background: continuousReview ? "#3A76C4" : "#D8E5F2",
              transition: "background-color 160ms ease",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: 2,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "#FFFFFF",
                boxShadow: "0 1px 3px rgba(26, 44, 64, 0.18)",
                transform: continuousReview
                  ? "translateX(14px)"
                  : "translateX(0)",
                transition: "transform 160ms ease",
              }}
            />
          </span>
        </button>
      </div>
    </section>
  );
}
