import { getJson, sendForm, sendJson } from "./client";

export interface TemplateVersion { id: number; version: number; source_kind: string; source_html?: string; source_css?: string; validation_report?: { valid?: boolean; errors?: string[] }; created_at?: string; }
export interface BadgeTemplate { id: number; name: string; orientation: string; width_mm: number; height_mm: number; status: string; versions?: TemplateVersion[]; published_version?: TemplateVersion | null; }
export interface TemplateProposal { html: string; css: string; notes: string; validation_report?: { valid?: boolean; errors?: string[] }; }

export const fetchAdminTemplates = () => getJson<{ templates: BadgeTemplate[] }>("/admin/badge_templates").then(r => r.templates);
export const fetchStudioTemplates = () => getJson<{ templates: BadgeTemplate[] }>("/template_studio").then(r => r.templates);
export const createAdminTemplate = (data: { name: string; orientation: string; width_mm: number; height_mm: number; html: string; css: string; generation_job_id?: number }) =>
  sendJson<{ template: BadgeTemplate }>("/admin/badge_templates", "POST", {
    badge_template: { name: data.name, orientation: data.orientation, width_mm: data.width_mm, height_mm: data.height_mm },
    source: { source_html: data.html, source_css: data.css, source_kind: "manual" }, generation_job_id: data.generation_job_id,
  }).then(r => r.template);
export const createStudioTemplate = (data: { name: string; orientation: string; width_mm: number; height_mm: number; html: string; css: string; generation_job_id?: number }) =>
  sendJson<{ template: BadgeTemplate }>("/template_studio", "POST", {
    badge_template: { name: data.name, orientation: data.orientation, width_mm: data.width_mm, height_mm: data.height_mm },
    source: { source_html: data.html, source_css: data.css }, generation_job_id: data.generation_job_id,
  }).then(r => r.template);
export const updateAdminTemplate = (id: number, data: Partial<{ name: string; orientation: string; width_mm: number; height_mm: number }> & { html?: string; css?: string; generation_job_id?: number }) =>
  sendJson<{ template: BadgeTemplate }>(`/admin/badge_templates/${id}`, "PATCH", {
    badge_template: { name: data.name, orientation: data.orientation, width_mm: data.width_mm, height_mm: data.height_mm },
    ...(data.html !== undefined ? { source: { source_html: data.html, source_css: data.css ?? "", source_kind: "manual" } } : {}),
    generation_job_id: data.generation_job_id,
  }).then(r => r.template);
export const updateStudioTemplate = (id: number, data: Partial<{ name: string; orientation: string; width_mm: number; height_mm: number }> & { html?: string; css?: string; generation_job_id?: number }) =>
  sendJson<{ template: BadgeTemplate }>(`/template_studio/${id}`, "PATCH", {
    badge_template: { name: data.name, orientation: data.orientation, width_mm: data.width_mm, height_mm: data.height_mm },
    ...(data.html !== undefined ? { source: { source_html: data.html, source_css: data.css ?? "" } } : {}),
    generation_job_id: data.generation_job_id,
  }).then(r => r.template);
export const generateTemplate = (requirement: string, complexity: number, reference_notes: string, model_id: string | null, width_mm: number, height_mm: number, assets: File[]) => {
  const form = new FormData();
  form.set("requirement", requirement); form.set("complexity", String(complexity)); form.set("reference_notes", reference_notes); form.set("width_mm", String(width_mm)); form.set("height_mm", String(height_mm)); if (model_id) form.set("model_id", model_id);
  assets.forEach(asset => form.append("reference_assets[]", asset));
  return sendForm<{ job: { id: number; status: string; stage: string; stage_message?: string } }>("/admin/badge_templates/generate", "POST", form).then(r => r.job);
};
export const generateStudioTemplate = (requirement: string, complexity: number, reference_notes: string, model_id: string | null, width_mm: number, height_mm: number, assets: File[]) => {
  const form = new FormData();
  form.set("requirement", requirement); form.set("complexity", String(complexity)); form.set("reference_notes", reference_notes); form.set("width_mm", String(width_mm)); form.set("height_mm", String(height_mm)); if (model_id) form.set("model_id", model_id);
  assets.forEach(asset => form.append("reference_assets[]", asset));
  return sendForm<{ job: { id: number; status: string; stage: string; stage_message?: string } }>("/template_studio/generate", "POST", form).then(r => r.job);
};
export const publishTemplate = (id: number, versionId: number) => sendJson<{ template: BadgeTemplate }>(`/admin/badge_templates/${id}/publish`, "POST", { version_id: versionId }).then(r => r.template);
export const archiveTemplate = (id: number) => sendJson<{ template: BadgeTemplate }>(`/admin/badge_templates/${id}/archive`, "POST", {}).then(r => r.template);
export const compareTemplateVersions = (id: number, baseVersionId: number, targetVersionId: number) =>
  getJson<{ base: TemplateVersion; target: TemplateVersion; changed: { html: boolean; css: boolean } }>(`/admin/badge_templates/${id}/compare?base_version_id=${baseVersionId}&target_version_id=${targetVersionId}`);
export const rollbackTemplate = (id: number, versionId: number) =>
  sendJson<{ version: TemplateVersion }>(`/admin/badge_templates/${id}/rollback`, "POST", { version_id: versionId }).then(r => r.version);
export const enqueueVisualRepair = (id: number, versionId: number, diagnostics: string, requirement: string, complexity: number) =>
  sendJson<{ job: { id: number; status: string } }>(`/admin/badge_templates/${id}/enqueue_visual_repair`, "POST", { version_id: versionId, diagnostics, requirement, complexity }).then(r => r.job);
export const fetchJob = (id: number) => getJson<{ job: { status: string; stage?: string; stage_message?: string; result?: TemplateProposal; error_message?: string } }>(`/admin/template_generation_jobs/${id}`).then(r => r.job);
export const fetchStudioJob = (id: number) => getJson<{ job: { status: string; stage?: string; stage_message?: string; result?: TemplateProposal; error_message?: string } }>(`/template_generation_jobs/${id}`).then(r => r.job);
export const applyJob = (id: number) => sendJson<{ version: TemplateVersion }>(`/admin/template_generation_jobs/${id}/apply`, "POST", {}).then(r => r.version);
export interface TemplateAgentStatus { connected: boolean; ready: boolean; node: { name: string; last_seen_at?: string; capabilities?: Record<string, unknown>; paused?: boolean } | null; }
export const fetchTemplateAgentStatus = () => getJson<TemplateAgentStatus>("/admin/template-agent/status");
