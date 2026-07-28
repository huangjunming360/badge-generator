// 与 Rails /api/v1 通信的唯一入口。
//
// 走相对路径 /api/v1：nginx 把前端静态产物和 /api 反代到同一个源，
// 因此不存在跨域，也不需要 CORS 配置或凭据设置。
// 开发期 vite dev server 用 proxy 达到同样效果（见 vite.config.ts）。

const BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  errors: string[];
  details: Record<string, string[]>;

  constructor(status: number, errors: string[], details: Record<string, string[]> = {}) {
    super(errors[0] ?? `请求失败（HTTP ${status}）`);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
    this.details = details;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // 后端理论上只回 JSON，但反代或网关出错时可能是 HTML 错误页，
      // 那种情况下把状态码原样抛出，不要让 JSON.parse 的报错盖住真实原因。
      throw new ApiError(res.status, [`服务端返回了非 JSON 响应（HTTP ${res.status}）`]);
    }
  }

  if (!res.ok) {
    const body = (payload ?? {}) as { errors?: string[]; details?: Record<string, string[]> };
    throw new ApiError(res.status, body.errors ?? [`请求失败（HTTP ${res.status}）`], body.details ?? {});
  }

  return payload as T;
}

export function getJson<T>(path: string): Promise<T> {
  return fetch(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
  }).then(parse<T>);
}

export function sendJson<T>(path: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(parse<T>);
}

// 文件上传必须走 multipart，不能设 Content-Type ——
// 浏览器要自己补 boundary。
export function sendForm<T>(path: string, method: "POST" | "PATCH", form: FormData): Promise<T> {
  return fetch(`${BASE}${path}`, {
    method,
    headers: { Accept: "application/json" },
    body: form,
  }).then(parse<T>);
}
