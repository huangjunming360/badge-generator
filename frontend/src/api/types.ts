// 后端契约的 TypeScript 镜像。字段名与 CardSerializer / SchemaController 一一对应，
// 改后端响应结构时这里必须同步。

export interface PortraitPayload {
  url: string;
  filename: string;
  content_type: string;
  byte_size: number;
}

// key 为 Card::FIELDS 定义的字段，后端保证 key 齐全，值可能为 null。
export type CardFields = Record<string, string | null>;

export interface CardPayload {
  id: number;
  fields: CardFields;
  ai_fields?: AiField[];
  filled_count: number;
  source_name: string | null;
  used_ocr: boolean;
  width_mm: number;
  height_mm: number;
  default_size: boolean;
  portrait: PortraitPayload | null;
  created_at: string;
  updated_at: string;
  raw_input?: string;
}

export interface AiField {
  key: string;
  value: string;
  label: string;
  icon?: string;
  selected?: boolean;
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
  upload: {
    allowed_extensions: string[];
    max_bytes: number;
  };
  mineru: {
    available: boolean;
    portrait_detect: boolean;
  };
}

export interface ProgressStatus {
  stage: string;
  message: string;
  updated_at: string;
  card_id?: number;
}
