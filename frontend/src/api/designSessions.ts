import { getJson, sendForm, sendJson } from "./client";

export interface DesignAsset {
  id: number;
  name: string;
  content_type: string;
  url: string;
}

export interface DesignConfiguration {
  complexity: number;
  reference_notes: string;
  model_id?: string | null;
  width_mm: number;
  height_mm: number;
  semantic_fields?: SemanticField[];
}

export interface SemanticField {
  key: string;
  label: string;
  default_value?: string;
}

export interface DesignJob {
  id: number;
  job_type: string;
  status: string;
  stage: string;
  stage_message?: string | null;
  attempts: number;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface DesignMessage {
  id: number;
  role: "user" | "assistant" | "system";
  state: "queued" | "processing" | "complete" | "cancelled" | "failed";
  content: string;
  metadata: { proposal?: { html?: string; css?: string; notes?: string }; job_id?: number; error?: string };
  job_id?: number | null;
  assets: DesignAsset[];
  created_at: string;
}

export interface DesignSession {
  id: number;
  name: string;
  status: string;
  configuration: DesignConfiguration;
  created_at: string;
  updated_at: string;
  active_job?: DesignJob | null;
  assets?: DesignAsset[];
  messages?: DesignMessage[];
  jobs?: DesignJob[];
}

export const fetchDesignSessions = () =>
  getJson<{ sessions: DesignSession[] }>("/template_design_sessions").then((result) => result.sessions);

export const fetchDesignSession = (id: number) =>
  getJson<{ session: DesignSession }>(`/template_design_sessions/${id}`).then((result) => result.session);

export const createDesignSession = (data: {
  name: string;
  initial_message?: string;
  configuration: DesignConfiguration;
  assets: File[];
}) => {
  const form = new FormData();
  form.set("name", data.name);
  form.set("initial_message", data.initial_message ?? "");
  Object.entries(data.configuration).forEach(([key, value]) => {
    if (key === "semantic_fields") {
      (value as SemanticField[] | undefined)?.forEach((field, index) => {
        form.set(`configuration[semantic_fields][${index}][key]`, field.key);
        form.set(`configuration[semantic_fields][${index}][label]`, field.label);
        if (field.default_value) form.set(`configuration[semantic_fields][${index}][default_value]`, field.default_value);
      });
      return;
    }
    if (value !== undefined && value !== null) form.set(`configuration[${key}]`, String(value));
  });
  data.assets.forEach((asset) => form.append("reference_assets[]", asset));
  return sendForm<{ session: DesignSession }>("/template_design_sessions", "POST", form).then((result) => result.session);
};

export const appendDesignMessage = (id: number, data: { content: string; configuration?: Partial<DesignConfiguration>; assets: File[] }) => {
  const form = new FormData();
  form.set("content", data.content);
  Object.entries(data.configuration ?? {}).forEach(([key, value]) => {
    if (key === "semantic_fields") {
      (value as SemanticField[] | undefined)?.forEach((field, index) => {
        form.set(`configuration[semantic_fields][${index}][key]`, field.key);
        form.set(`configuration[semantic_fields][${index}][label]`, field.label);
        if (field.default_value) form.set(`configuration[semantic_fields][${index}][default_value]`, field.default_value);
      });
      return;
    }
    if (value !== undefined && value !== null) form.set(`configuration[${key}]`, String(value));
  });
  data.assets.forEach((asset) => form.append("reference_assets[]", asset));
  return sendForm<{ message: DesignMessage; session: DesignSession }>(`/template_design_sessions/${id}/append_message`, "POST", form);
};

export const interruptDesignSession = (id: number) =>
  sendJson<{ session: DesignSession }>(`/template_design_sessions/${id}/interrupt`, "POST", {}).then((result) => result.session);
