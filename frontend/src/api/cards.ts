import { getJson, sendJson, sendForm } from "./client";
import type { CardPayload, CardFields, SchemaPayload, ProgressStatus } from "./types";

export const fetchSchema = () => getJson<SchemaPayload>("/schema");

export const fetchCards = () =>
  getJson<{ cards: CardPayload[] }>("/cards").then((r) => r.cards);

export const fetchCard = (id: number) =>
  getJson<{ card: CardPayload }>(`/cards/${id}`).then((r) => r.card);

export const fetchProgress = (taskId: string) =>
  getJson<ProgressStatus>(`/progress/${taskId}`);

// 异步建卡：返回 task_id，前端轮询进度
function startCreate(params: any): Promise<{ task_id: string; card_id: number }> {
  return sendJson("/cards", "POST", params);
}

function startCreateForm(form: FormData): Promise<{ task_id: string; card_id: number }> {
  return sendForm("/cards", "POST", form);
}

// 轮询进度直到完成，返回 card_id
export function pollCard(params: {
  rawInput?: string; file?: File; portrait?: File | null; modelId?: string | null;
}, onProgress: (p: ProgressStatus) => void): Promise<number> {
  const work = params.file
    ? (() => {
        const form = new FormData();
        form.append("document", params.file);
        if (params.portrait) form.append("portrait", params.portrait);
        if (params.modelId) form.append("model_id", params.modelId);
        return startCreateForm(form);
      })()
    : startCreate({
        raw_input: params.rawInput,
        ...(params.modelId ? { model_id: params.modelId } : {}),
      });

  return work.then(({ task_id, card_id }) => {
    return new Promise((resolve, reject) => {
      const poll = setInterval(async () => {
        try {
          const p = await fetchProgress(task_id);
          onProgress(p);
          if (p.stage === "done") { clearInterval(poll); resolve(card_id); }
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

export const uploadPortrait = (id: number, portrait: File) => {
  const form = new FormData();
  form.append("portrait", portrait);
  return sendForm<{ card: CardPayload }>(`/cards/${id}`, "PATCH", form).then((r) => r.card);
};
