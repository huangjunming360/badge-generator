import { getJson, sendJson } from "./client";

export interface UserInfo {
  email_address: string;
  admin: boolean;
  model_level: number;
  model_level_label: string;
}

export function fetchCurrentUser(): Promise<{ user: UserInfo | null }> {
  return getJson("/session");
}

export function login(email: string, password: string): Promise<{ user: UserInfo }> {
  return sendJson("/session", "POST", { email_address: email, password });
}

export function logout(): Promise<{ message: string }> {
  return fetch("/api/v1/session", {
    method: "DELETE",
    headers: { Accept: "application/json" },
  }).then(r => r.json());
}
