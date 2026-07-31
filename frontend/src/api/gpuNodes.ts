import { getJson, sendJson } from "./client";

export interface GpuNode {
  id: number;
  node_key: string;
  name: string;
  active: boolean;
  online: boolean;
  ready: boolean;
  last_seen_at?: string;
  capabilities: Record<string, unknown>;
  desired_config: {
    paused: boolean;
    max_iterations: number;
    max_concurrency: 1;
    claude_model_id: string | null;
    claude_model: string | null;
    claude_base_url: string | null;
  };
  leased_jobs_count: number;
}

export interface AgentModel {
  id: string;
  label: string;
  model: string;
  api_base: string | null;
  capabilities: string[];
}

export interface NodeCredentials {
  node_id: string;
  token: string;
  environment: Record<string, string>;
}

export const fetchGpuNodes = () =>
  getJson<{ nodes: GpuNode[]; agent_models: AgentModel[] }>("/admin/gpu_nodes");

export const createGpuNode = (name: string, serverUrl: string) =>
  sendJson<{ node: GpuNode; credentials: NodeCredentials }>("/admin/gpu_nodes", "POST", {
    gpu_node: { name, server_url: serverUrl },
  });

export const updateGpuNodeConfig = (id: number, paused: boolean, maxIterations: number, claudeModelId?: string | null) =>
  sendJson<{ node: GpuNode }>(`/admin/gpu_nodes/${id}/update_config`, "PATCH", {
    gpu_node: { paused, max_iterations: maxIterations, ...(claudeModelId !== undefined ? { claude_model_id: claudeModelId } : {}) },
  }).then((response) => response.node);

export const rotateGpuNodeToken = (id: number, serverUrl: string) =>
  sendJson<{ node: GpuNode; credentials: NodeCredentials }>(`/admin/gpu_nodes/${id}/rotate_token`, "POST", {
    gpu_node: { server_url: serverUrl },
  });

export const revokeGpuNode = (id: number) =>
  sendJson<{ node: GpuNode; released_jobs: number }>(`/admin/gpu_nodes/${id}/revoke`, "POST", {});
