// 后端契约的 TypeScript 镜像。字段名与 CardSerializer / SchemaController 一一对应，
// 改后端响应结构时这里必须同步。

export interface PortraitPayload {
  url: string;
  filename: string;
  content_type: string;
  byte_size: number;
}

// key 为 Card::FIELDS 的 14 个字段，后端保证 key 齐全，值可能为 null。
export type CardFields = Record<string, string | null>;

export interface CardPayload {
  id: number;
  fields: CardFields;
  filled_count: number;
  source_name: string | null;
  used_ocr: boolean;
  width_mm: number;
  height_mm: number;
  default_size: boolean;
  portrait: PortraitPayload | null;
  created_at: string;
  updated_at: string;
  // 仅 show/create/update 返回，index 不含。
  raw_input?: string;
}

export interface SchemaFieldDef {
  key: string;
  label: string;
  default: string | null;
}

export interface SchemaPayload {
  fields: SchemaFieldDef[];
  size: {
    default_width_mm: number;
    default_height_mm: number;
    min_mm: number;
    max_mm: number;
  };
  preview: {
    scales: number[];
    default_scale: number;
  };
  portrait: {
    content_types: string[];
    max_bytes: number;
  };
  // 可选模型清单。后端只暴露 id/label，凭据不外泄。
  models: {
    available: { id: string; label: string }[];
    default: string | null;
  };
  upload: {
    allowed_extensions: string[];
    max_bytes: number;
  };
}
