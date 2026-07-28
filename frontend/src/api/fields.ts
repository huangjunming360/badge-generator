import type { Field } from "../app/components/shared";
import type { CardFields, SchemaFieldDef } from "./types";

// 后端固定 schema ←→ 前端 Field[] 的转换。
//
// 后端的 Card::FIELDS 是固定 14 个字段，不接受自由增删（产品决策）。
// 因此前端的「删除字段」语义是清空值并取消勾选，字段本身仍在列表里，
// 只是不出现在挂牌上 —— 不是真的从 schema 里删掉。

// 字段归类，决定 UI 里的分组。后端不关心这个，纯展示用。
const CATEGORY: Record<string, Field["category"]> = {
  name: "person",
  name_en: "person",
  title: "person",
  department: "person",
  organization: "person",
  tagline: "person",
  phone: "contact",
  email: "contact",
  website: "contact",
  address: "contact",
  employee_id: "access",
  host_organization: "access",
  host_department: "access",
  event_topic: "access",
};

export function toFields(cardFields: CardFields, schema: SchemaFieldDef[]): Field[] {
  return schema.map((def) => {
    const value = cardFields[def.key] ?? "";
    return {
      id: def.key,
      key: def.key,
      label: def.label,
      value,
      // 有值的字段默认勾选上挂牌，空字段不勾 —— 免得用户逐个点。
      selected: value.trim().length > 0,
      category: CATEGORY[def.key] ?? "person",
    };
  });
}

// 回传给后端：空串转 null，让后端的 presence 逻辑把它当缺失。
export function toCardFields(fields: Field[]): CardFields {
  return Object.fromEntries(
    fields.map((f) => [f.key, f.value.trim() === "" ? null : f.value]),
  );
}
