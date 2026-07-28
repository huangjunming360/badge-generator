import { getJson, sendJson, sendForm } from "./client";
import type { CardPayload, CardFields, SchemaPayload } from "./types";

export const fetchSchema = () => getJson<SchemaPayload>("/schema");

export const fetchCards = () =>
  getJson<{ cards: CardPayload[] }>("/cards").then((r) => r.cards);

export const fetchCard = (id: number) =>
  getJson<{ card: CardPayload }>(`/cards/${id}`).then((r) => r.card);

// 粘贴文本建卡。提取由后端的 CardExtractor 走 LLM 完成，
// 前端不再做本地正则解析（那会与后端结果不一致）。
export const createCardFromText = (rawInput: string, modelId?: string | null) =>
  sendJson<{ card: CardPayload }>("/cards", "POST", {
    raw_input: rawInput,
    ...(modelId ? { model_id: modelId } : {}),
  }).then((r) => r.card);

// 上传文档建卡。后端负责按扩展名走文档解析或 OCR。
export const createCardFromDocument = (
  file: File, portrait?: File | null, modelId?: string | null,
) => {
  const form = new FormData();
  form.append("document", file);
  if (portrait) form.append("portrait", portrait);
  if (modelId) form.append("model_id", modelId);
  return sendForm<{ card: CardPayload }>("/cards", "POST", form).then((r) => r.card);
};

// 字段是合并语义：只传要改的 key，未提到的保持原值。
export const updateCardFields = (id: number, fields: Partial<CardFields>) =>
  sendJson<{ card: CardPayload }>(`/cards/${id}`, "PATCH", { fields }).then((r) => r.card);

export const updateCardSize = (id: number, widthMm: number, heightMm: number) =>
  sendJson<{ card: CardPayload }>(`/cards/${id}`, "PATCH", {
    card: { width_mm: widthMm, height_mm: heightMm },
  }).then((r) => r.card);

export const uploadPortrait = (id: number, portrait: File) => {
  const form = new FormData();
  form.append("portrait", portrait);
  return sendForm<{ card: CardPayload }>(`/cards/${id}`, "PATCH", form).then((r) => r.card);
};
