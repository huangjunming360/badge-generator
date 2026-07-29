import { getJson, sendJson, sendForm } from "./client";
import type { CardPayload, CardFields, SchemaPayload, ProgressStatus } from "./types";

export const fetchSchema = () => getJson<SchemaPayload>("/schema");

// 同步建卡（sync=1）：等 LLM 返回后才响应，适合建卡后立刻编辑
export const createCardFromText = (rawInput: string, modelId: string | null) =>
  sendJson<{ card: CardPayload }>("/cards", "POST", {
    raw_input: rawInput, model_id: modelId, sync: "1",
  }).then(r => ({ fields: r.card.fields as unknown as Record<string, string | null>, id: r.card.id }));

export const createCardFromDocument = (file: File, portrait: File | null, modelId: string | null) => {
  const form = new FormData();
  form.append("document", file);
  if (portrait) form.append("portrait", portrait);
  if (modelId) form.append("model_id", modelId);
  form.append("sync", "1");
  return sendForm<{ card: CardPayload }>("/cards", "POST", form)
    .then(r => ({ fields: r.card.fields as unknown as Record<string, string | null>, id: r.card.id }));
};

export const fetchCards = () =>
  getJson<{ cards: CardPayload[] }>("/cards").then((r) => r.cards);

export const fetchCard = (id: number) =>
  getJson<{ card: CardPayload }>(`/cards/${id}`).then((r) => r.card);

export const fetchProgress = (taskId: string) =>
  getJson<ProgressStatus>(`/progress/${taskId}`);

// 异步建卡：返回 task_id，前端轮询进度
function startCreate(params: any): Promise<{ task_id: string }> {
  return sendJson("/cards", "POST", params);
}

function startCreateForm(form: FormData): Promise<{ task_id: string }> {
  return sendForm("/cards", "POST", form);
}

// 轮询进度直到完成，返回 card_id
export function pollCard(params: {
  rawInput?: string; file?: File; portrait?: File | null; modelId?: string | null;
  mineru_enabled?: boolean; portrait_detect?: boolean;
}, onProgress: (p: ProgressStatus) => void): Promise<number> {
  // 有文件或手动上传了照片 → 走 FormData，否则走 JSON
  const needsForm = params.file || params.portrait;
  const work = needsForm
    ? (() => {
        const form = new FormData();
        if (params.file) form.append("document", params.file);
        if (params.portrait) form.append("portrait", params.portrait);
        if (params.modelId) form.append("model_id", params.modelId);
        form.append("mineru_enabled", params.mineru_enabled !== false ? "1" : "0");
        form.append("portrait_detect", params.portrait_detect !== false ? "1" : "0");
        return startCreateForm(form);
      })()
    : startCreate({
        raw_input: params.rawInput,
        ...(params.modelId ? { model_id: params.modelId } : {}),
        mineru_enabled: params.mineru_enabled !== false ? "1" : "0",
        portrait_detect: params.portrait_detect !== false ? "1" : "0",
      });

  return work.then(({ task_id }) => {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const MAX = 360;  // 6 分钟上限
      const poll = setInterval(async () => {
        if (++attempts > MAX) { clearInterval(poll); reject(new Error("解析超时，请重试")); return; }
        try {
          const p = await fetchProgress(task_id);
          onProgress(p);
          if (p.stage === "done") { clearInterval(poll); resolve(p.card_id!); }
          if (p.stage === "error") { clearInterval(poll); reject(new Error(p.message || "解析失败")); }
        } catch (e) {
          clearInterval(poll); reject(e);
        }
      }, 1000);
    });
  });
}

// 字段是合并语义：只传要改的 key，未提到的保持原值。
export const updateCardFields = (id: number, fields: Partial<CardFields>) =>
  sendJson<{ card: CardPayload }>(`/cards/${id}`, "PATCH", { fields }).then((r) => r.card);

export const updateCardSize = (id: number, widthMm: number, heightMm: number) =>
  sendJson<{ card: CardPayload }>(`/cards/${id}`, "PATCH", {
    card: { width_mm: widthMm, height_mm: heightMm },
  }).then((r) => r.card);

export const deleteCard = (id: number) =>
  fetch(`/api/v1/cards/${id}`, { method: "DELETE", headers: { Accept: "application/json" } }).then(async r => {
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error((body as any).errors?.[0] || "删除失败");
    }
  });

export const batchDeleteCards = (ids: number[]) =>
  fetch("/api/v1/cards/batch", {
    method: "DELETE", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ids }),
  }).then(async r => {
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error((body as any).errors?.[0] || "批量删除失败");
    }
  });

export const uploadPortrait = (id: number, portrait: File) => {
  const form = new FormData();
  form.append("portrait", portrait);
  return sendForm<{ card: CardPayload }>(`/cards/${id}`, "PATCH", form).then((r) => r.card);
};
