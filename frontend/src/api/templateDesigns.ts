import { sendJson } from "./client";
import {
  isCustomTemplateDesign,
  type CustomTemplateDesign,
} from "../app/customTemplate";
import {
  isHtmlTemplateDocument,
  type HtmlTemplateDocument,
} from "../app/htmlTemplate";

export type TemplateDesignPhase = "generate" | "review";

export interface TemplateDesignHistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export interface TemplateDesignRequest {
  prompt: string;
  current_design: CustomTemplateDesign;
  current_document?: HtmlTemplateDocument;
  history: TemplateDesignHistoryEntry[];
  phase: TemplateDesignPhase;
  preview_image?: string;
  reference_image?: string;
}

export interface TemplateDesignResponse {
  design: CustomTemplateDesign;
  document: HtmlTemplateDocument | null;
  message: string;
  request_preview: boolean;
}

interface TemplateDesignWireResponse {
  design?: unknown;
  document?: unknown;
  message?: unknown;
  request_preview?: unknown;
}

const MAX_HISTORY = 8;

export async function requestTemplateDesign(
  cardId: number,
  request: TemplateDesignRequest,
  signal?: AbortSignal,
): Promise<TemplateDesignResponse> {
  const body: TemplateDesignRequest = {
    prompt: request.prompt,
    current_design: request.current_design,
    ...(request.current_document
      ? { current_document: request.current_document }
      : {}),
    // 聊天界面可以为消息附加本地预览数据；API 历史只发送模型需要的文字，
    // 避免参考图的 Base64 在后续每一轮被重复上传。
    history: request.history
      .slice(-MAX_HISTORY)
      .map(({ role, content }) => ({ role, content })),
    phase: request.phase,
    ...(request.preview_image ? { preview_image: request.preview_image } : {}),
    ...(request.reference_image
      ? { reference_image: request.reference_image }
      : {}),
  };

  const result = await sendJson<TemplateDesignWireResponse>(
    `/cards/${cardId}/template_design`,
    "POST",
    body,
    signal,
  );

  if (
    !isCustomTemplateDesign(result.design) ||
    !(
      result.document === undefined ||
      result.document === null ||
      isHtmlTemplateDocument(result.document)
    ) ||
    typeof result.message !== "string" ||
    typeof result.request_preview !== "boolean"
  ) {
    throw new Error("AI 返回了无效的模板设计");
  }

  return {
    design: result.design,
    document: result.document ?? null,
    message: result.message,
    request_preview: result.request_preview,
  };
}
