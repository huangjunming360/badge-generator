export const CUSTOM_TEMPLATE_ORIENTATIONS = ["portrait", "landscape"] as const;
export const CUSTOM_TEMPLATE_SIZE_MODES = ["auto", "custom"] as const;
export const CUSTOM_TEMPLATE_LAYOUTS = [
  "classic",
  "split",
  "centered",
  "editorial",
] as const;
export const CUSTOM_TEMPLATE_FONT_FAMILIES = [
  "sans",
  "serif",
  "display",
] as const;
export const CUSTOM_TEMPLATE_NAME_ALIGNS = ["left", "center"] as const;
export const CUSTOM_TEMPLATE_PHOTO_SHAPES = [
  "circle",
  "rounded",
  "square",
] as const;
export const CUSTOM_TEMPLATE_DENSITIES = [
  "compact",
  "comfortable",
  "airy",
] as const;
export const CUSTOM_TEMPLATE_DECORATIONS = [
  "minimal",
  "stripe",
  "blocks",
  "gradient",
  "dots",
] as const;

export const CUSTOM_TEMPLATE_LIMITS = {
  nameScale: { min: 0.8, max: 1.4 },
  cornerRadius: { min: 0, max: 28 },
  cardWidth: { min: 160, max: 480 },
  cardHeight: { min: 140, max: 640 },
  headerLabel: { maxLength: 30 },
  subLabel: { maxLength: 40 },
} as const;

export const CUSTOM_TEMPLATE_ALLOWED_VALUES = {
  orientation: CUSTOM_TEMPLATE_ORIENTATIONS,
  sizeMode: CUSTOM_TEMPLATE_SIZE_MODES,
  layout: CUSTOM_TEMPLATE_LAYOUTS,
  fontFamily: CUSTOM_TEMPLATE_FONT_FAMILIES,
  nameAlign: CUSTOM_TEMPLATE_NAME_ALIGNS,
  photoShape: CUSTOM_TEMPLATE_PHOTO_SHAPES,
  density: CUSTOM_TEMPLATE_DENSITIES,
  decoration: CUSTOM_TEMPLATE_DECORATIONS,
  nameScale: CUSTOM_TEMPLATE_LIMITS.nameScale,
  cornerRadius: CUSTOM_TEMPLATE_LIMITS.cornerRadius,
  cardWidth: CUSTOM_TEMPLATE_LIMITS.cardWidth,
  cardHeight: CUSTOM_TEMPLATE_LIMITS.cardHeight,
} as const;

export interface CustomTemplateDesign {
  orientation: (typeof CUSTOM_TEMPLATE_ORIENTATIONS)[number];
  sizeMode: (typeof CUSTOM_TEMPLATE_SIZE_MODES)[number];
  cardWidth: number;
  cardHeight: number;
  layout: (typeof CUSTOM_TEMPLATE_LAYOUTS)[number];
  showPhoto: boolean;
  showQR: boolean;
  showBarcode: boolean;
  showDots: boolean;
  headerLabel: string;
  subLabel: string;
  backgroundColor: string;
  surfaceColor: string;
  primaryColor: string;
  textColor: string;
  mutedColor: string;
  fontFamily: (typeof CUSTOM_TEMPLATE_FONT_FAMILIES)[number];
  nameAlign: (typeof CUSTOM_TEMPLATE_NAME_ALIGNS)[number];
  nameScale: number;
  cornerRadius: number;
  photoShape: (typeof CUSTOM_TEMPLATE_PHOTO_SHAPES)[number];
  density: (typeof CUSTOM_TEMPLATE_DENSITIES)[number];
  decoration: (typeof CUSTOM_TEMPLATE_DECORATIONS)[number];
}

export const DEFAULT_CUSTOM_TEMPLATE: CustomTemplateDesign = {
  orientation: "portrait",
  sizeMode: "custom",
  cardWidth: 200,
  cardHeight: 300,
  layout: "classic",
  showPhoto: true,
  showQR: true,
  showBarcode: false,
  showDots: false,
  headerLabel: "嘉 宾 证",
  subLabel: "EVENT BADGE",
  backgroundColor: "#FDFBF7",
  surfaceColor: "#F5F1E8",
  primaryColor: "#B86478",
  textColor: "#1A2C40",
  mutedColor: "#8AABBB",
  fontFamily: "sans",
  nameAlign: "left",
  nameScale: 1,
  cornerRadius: 12,
  photoShape: "circle",
  density: "comfortable",
  decoration: "minimal",
};

const DESIGN_KEYS = [
  "orientation",
  "sizeMode",
  "cardWidth",
  "cardHeight",
  "layout",
  "showPhoto",
  "showQR",
  "showBarcode",
  "showDots",
  "headerLabel",
  "subLabel",
  "backgroundColor",
  "surfaceColor",
  "primaryColor",
  "textColor",
  "mutedColor",
  "fontFamily",
  "nameAlign",
  "nameScale",
  "cornerRadius",
  "photoShape",
  "density",
  "decoration",
] as const satisfies readonly (keyof CustomTemplateDesign)[];

const HEX_COLOR = /^#[0-9A-F]{6}$/i;

function oneOf<T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function inRange(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

/**
 * API 与 LLM 的返回值都不可信。除逐项校验外也拒绝额外字段，避免模型把
 * HTML、脚本或尚未实现的配置偷偷带进渲染状态。
 */
export function isCustomTemplateDesign(
  value: unknown,
): value is CustomTemplateDesign {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (
    keys.length !== DESIGN_KEYS.length ||
    keys.some((key) => !DESIGN_KEYS.includes(key as keyof CustomTemplateDesign))
  ) {
    return false;
  }

  return (
    oneOf(CUSTOM_TEMPLATE_ORIENTATIONS, candidate.orientation) &&
    oneOf(CUSTOM_TEMPLATE_SIZE_MODES, candidate.sizeMode) &&
    inRange(
      candidate.cardWidth,
      CUSTOM_TEMPLATE_LIMITS.cardWidth.min,
      CUSTOM_TEMPLATE_LIMITS.cardWidth.max,
    ) &&
    inRange(
      candidate.cardHeight,
      CUSTOM_TEMPLATE_LIMITS.cardHeight.min,
      CUSTOM_TEMPLATE_LIMITS.cardHeight.max,
    ) &&
    oneOf(CUSTOM_TEMPLATE_LAYOUTS, candidate.layout) &&
    typeof candidate.showPhoto === "boolean" &&
    typeof candidate.showQR === "boolean" &&
    typeof candidate.showBarcode === "boolean" &&
    typeof candidate.showDots === "boolean" &&
    typeof candidate.headerLabel === "string" &&
    Array.from(candidate.headerLabel).length <=
      CUSTOM_TEMPLATE_LIMITS.headerLabel.maxLength &&
    typeof candidate.subLabel === "string" &&
    Array.from(candidate.subLabel).length <=
      CUSTOM_TEMPLATE_LIMITS.subLabel.maxLength &&
    typeof candidate.backgroundColor === "string" &&
    HEX_COLOR.test(candidate.backgroundColor) &&
    typeof candidate.surfaceColor === "string" &&
    HEX_COLOR.test(candidate.surfaceColor) &&
    typeof candidate.primaryColor === "string" &&
    HEX_COLOR.test(candidate.primaryColor) &&
    typeof candidate.textColor === "string" &&
    HEX_COLOR.test(candidate.textColor) &&
    typeof candidate.mutedColor === "string" &&
    HEX_COLOR.test(candidate.mutedColor) &&
    oneOf(CUSTOM_TEMPLATE_FONT_FAMILIES, candidate.fontFamily) &&
    oneOf(CUSTOM_TEMPLATE_NAME_ALIGNS, candidate.nameAlign) &&
    inRange(
      candidate.nameScale,
      CUSTOM_TEMPLATE_LIMITS.nameScale.min,
      CUSTOM_TEMPLATE_LIMITS.nameScale.max,
    ) &&
    inRange(
      candidate.cornerRadius,
      CUSTOM_TEMPLATE_LIMITS.cornerRadius.min,
      CUSTOM_TEMPLATE_LIMITS.cornerRadius.max,
    ) &&
    oneOf(CUSTOM_TEMPLATE_PHOTO_SHAPES, candidate.photoShape) &&
    oneOf(CUSTOM_TEMPLATE_DENSITIES, candidate.density) &&
    oneOf(CUSTOM_TEMPLATE_DECORATIONS, candidate.decoration)
  );
}

export interface CustomTemplateSize {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 自定义模板的唯一尺寸解析入口。custom 模式忠实使用用户给出的像素尺寸；
 * auto 模式则按方向和已选字段数留出稳定余量，避免字段增加后挤出画布。
 */
export function resolveCustomTemplateSize(
  design: CustomTemplateDesign,
  selectedFieldCount: number,
): CustomTemplateSize {
  if (design.sizeMode === "custom") {
    return {
      width: clamp(
        design.cardWidth,
        CUSTOM_TEMPLATE_LIMITS.cardWidth.min,
        CUSTOM_TEMPLATE_LIMITS.cardWidth.max,
      ),
      height: clamp(
        design.cardHeight,
        CUSTOM_TEMPLATE_LIMITS.cardHeight.min,
        CUSTOM_TEMPLATE_LIMITS.cardHeight.max,
      ),
    };
  }

  const count = clamp(
    Number.isFinite(selectedFieldCount) ? Math.floor(selectedFieldCount) : 1,
    1,
    18,
  );

  if (design.orientation === "landscape") {
    return {
      width: clamp(286 + Math.min(count, 14) * 12, 320, 454),
      height: clamp(154 + Math.ceil(count / 2) * 18, 172, 334),
    };
  }

  return {
    width: clamp(188 + Math.min(count, 8) * 3, 192, 212),
    height: clamp(220 + count * 20, 260, 580),
  };
}
