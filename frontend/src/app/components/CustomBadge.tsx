import type { CSSProperties, ReactNode } from "react";
import {
  resolveCustomTemplateSize,
  type CustomTemplateDesign,
} from "../customTemplate";
import type { Field } from "./shared";

const FONT_STACKS: Record<CustomTemplateDesign["fontFamily"], string> = {
  sans: "'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif",
  serif: "'Songti SC','STSong','Noto Serif CJK SC',serif",
  display:
    "'Arial Black','PingFang SC','Microsoft YaHei','Noto Sans CJK SC',sans-serif",
};

const DENSITY = {
  compact: { pad: 10, gap: 4, fieldGap: 3 },
  comfortable: { pad: 14, gap: 7, fieldGap: 5 },
  airy: { pad: 18, gap: 10, fieldGap: 7 },
} as const;

function PreviewPortrait({
  url,
  size,
  shape,
  primary,
  muted,
}: {
  url?: string | null;
  size: number;
  shape: CustomTemplateDesign["photoShape"];
  primary: string;
  muted: string;
}) {
  const radius = shape === "circle" ? "50%" : shape === "rounded" ? 12 : 2;
  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        overflow: "hidden",
        borderRadius: radius,
        border: `2px solid ${primary}55`,
        background: muted,
        display: "grid",
        placeItems: "center",
        color: primary,
        fontSize: size * 0.42,
        fontWeight: 700,
      }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        <span aria-hidden>人</span>
      )}
    </div>
  );
}

function QrGlyph({ color, size = 34 }: { color: string; size?: number }) {
  const cells = [
    [0, 0, 5, 5],
    [0, 12, 5, 5],
    [12, 0, 5, 5],
  ];
  const dots = [
    [7, 1],
    [7, 4],
    [7, 7],
    [7, 10],
    [8, 14],
    [9, 5],
    [9, 9],
    [10, 12],
    [11, 7],
    [12, 9],
    [12, 13],
    [14, 6],
    [14, 10],
    [15, 14],
    [16, 8],
    [16, 12],
    [16, 16],
  ];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 17 17"
      aria-hidden
      style={{ display: "block", flexShrink: 0 }}
    >
      {cells.map(([x, y, width, height], index) => (
        <g key={index}>
          <rect
            x={x + 0.35}
            y={y + 0.35}
            width={width - 0.7}
            height={height - 0.7}
            rx=".45"
            fill="none"
            stroke={color}
            strokeWidth=".7"
          />
          <rect
            x={x + 1.5}
            y={y + 1.5}
            width={width - 3}
            height={height - 3}
            rx=".25"
            fill={color}
          />
        </g>
      ))}
      {dots.map(([x, y], index) => (
        <rect key={index} x={x} y={y} width=".9" height=".9" rx=".18" fill={color} />
      ))}
    </svg>
  );
}

function BarcodeGlyph({ color }: { color: string }) {
  const bars = [2, 1, 3, 1, 2, 2, 1, 3, 1, 2, 1, 3, 2, 1, 2];
  let cursor = 0;
  return (
    <svg width="58" height="18" viewBox="0 0 58 18" aria-hidden>
      {bars.map((width, index) => {
        const x = cursor;
        cursor += width + 1.5;
        return index % 2 === 0 ? (
          <rect key={index} x={x} y="0" width={width} height="18" fill={color} />
        ) : null;
      })}
    </svg>
  );
}

function AccessMarks({
  color,
  muted,
}: {
  color: string;
  muted: string;
}) {
  return (
    <span style={{ display: "inline-flex", gap: 3 }}>
      {[0, 1, 2, 3].map((index) => (
        <i
          key={index}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: index < 3 ? color : muted,
          }}
        />
      ))}
    </span>
  );
}

function Decoration({
  design,
}: {
  design: CustomTemplateDesign;
}) {
  const common: CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
  };

  if (design.decoration === "gradient") {
    return (
      <div
        style={{
          ...common,
          background: `linear-gradient(145deg, ${design.primaryColor}22 0%, transparent 42%, ${design.mutedColor}44 100%)`,
        }}
      />
    );
  }
  if (design.decoration === "dots") {
    return (
      <div
        style={{
          ...common,
          opacity: 0.38,
          backgroundImage: `radial-gradient(${design.primaryColor} 1px, transparent 1px)`,
          backgroundSize: "12px 12px",
          maskImage: "linear-gradient(135deg, #000 0%, transparent 62%)",
        }}
      />
    );
  }
  if (design.decoration === "blocks") {
    return (
      <>
        <i
          style={{
            position: "absolute",
            width: 72,
            height: 72,
            right: -28,
            top: -30,
            borderRadius: 18,
            transform: "rotate(28deg)",
            background: `${design.primaryColor}22`,
          }}
        />
        <i
          style={{
            position: "absolute",
            width: 48,
            height: 48,
            left: -24,
            bottom: -24,
            borderRadius: 14,
            transform: "rotate(28deg)",
            background: `${design.mutedColor}55`,
          }}
        />
      </>
    );
  }
  if (design.decoration === "stripe") {
    return (
      <div
        style={{
          ...common,
          inset: "auto 0 0",
          height: 7,
          background: `repeating-linear-gradient(135deg, ${design.primaryColor}, ${design.primaryColor} 8px, ${design.mutedColor} 8px, ${design.mutedColor} 16px)`,
        }}
      />
    );
  }
  return (
    <div
      style={{
        ...common,
        inset: "0 0 auto",
        height: 4,
        background: design.primaryColor,
      }}
    />
  );
}

function FieldList({
  fields,
  design,
  centered = false,
  columns = false,
}: {
  fields: Field[];
  design: CustomTemplateDesign;
  centered?: boolean;
  columns?: boolean;
}) {
  const density = DENSITY[design.density];
  return (
    <div
      style={{
        minWidth: 0,
        display: "grid",
        gridTemplateColumns: columns ? "1fr 1fr" : "1fr",
        columnGap: 10,
        rowGap: density.fieldGap,
        alignContent: "start",
      }}
    >
      {fields.map((field) => (
        <div
          key={field.key}
          style={{
            minWidth: 0,
            textAlign: centered ? "center" : "left",
          }}
        >
          <div
            style={{
              color: design.mutedColor,
              fontSize: 6.5,
              lineHeight: 1.2,
              letterSpacing: ".09em",
              textTransform: "uppercase",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {field.label}
          </div>
          <div
            style={{
              marginTop: 1,
              color: design.textColor,
              fontSize: 8.3,
              fontWeight: 550,
              lineHeight: 1.25,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflowWrap: "anywhere",
            }}
          >
            {field.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function Verification({
  design,
}: {
  design: CustomTemplateDesign;
}) {
  if (!design.showQR && !design.showBarcode && !design.showDots) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        flexShrink: 0,
      }}
    >
      {design.showQR && <QrGlyph color={design.primaryColor} />}
      {design.showBarcode && <BarcodeGlyph color={design.primaryColor} />}
      {design.showDots && (
        <AccessMarks color={design.primaryColor} muted={design.mutedColor} />
      )}
    </div>
  );
}

function BadgeFrame({
  design,
  width,
  height,
  children,
}: {
  design: CustomTemplateDesign;
  width: number;
  height: number;
  children: ReactNode;
}) {
  return (
    <div
      data-custom-template-preview
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        borderRadius: design.cornerRadius,
        border: `1px solid ${design.mutedColor}88`,
        background: design.backgroundColor,
        color: design.textColor,
        fontFamily: FONT_STACKS[design.fontFamily],
        boxShadow: "none",
      }}
    >
      <Decoration design={design} />
      <div style={{ position: "relative", zIndex: 1, width: "100%", height: "100%" }}>
        {children}
      </div>
    </div>
  );
}

export function CustomBadge({
  fields,
  design,
  portraitUrl,
  scale = 1,
  watermark,
}: {
  fields: Field[];
  design: CustomTemplateDesign;
  portraitUrl?: string | null;
  scale?: number;
  watermark?: string;
}) {
  const landscape = design.orientation === "landscape";
  const { width, height } = resolveCustomTemplateSize(design, fields.length);
  const density = DENSITY[design.density];
  const name = fields.find((field) => field.key === "name")?.value || "姓名";
  const otherFields = fields.filter((field) => field.key !== "name");
  const title = design.headerLabel;
  const subtitle = design.subLabel;
  // split 的左右面板都有不透明背景，原先会把 BadgeFrame 下层的渐变装饰
  // 完全盖住。渐变模式必须直接画在面板自身，五个颜色角色才会真实可见。
  const splitPrimaryBackground =
    design.decoration === "gradient"
      ? `linear-gradient(145deg, ${design.backgroundColor} 0%, ${design.primaryColor} 100%)`
      : design.primaryColor;
  const splitSurfaceBackground =
    design.decoration === "gradient"
      ? `linear-gradient(145deg, ${design.surfaceColor} 0%, ${design.mutedColor} 100%)`
      : design.surfaceColor;
  const nameStyle: CSSProperties = {
    color: design.textColor,
    fontSize: 16 * design.nameScale,
    fontWeight: design.fontFamily === "display" ? 850 : 700,
    lineHeight: 1.12,
    textAlign: design.nameAlign,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  let content: ReactNode;

  if (design.layout === "split") {
    const panel = (
      <div
        style={{
          width: landscape ? "38%" : "100%",
          height: landscape ? "100%" : 116,
          flexShrink: 0,
          padding: landscape ? 15 : "14px 18px",
          background: splitPrimaryBackground,
          color: design.textColor,
          display: "flex",
          flexDirection: landscape ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          gap: landscape ? 9 : 12,
          textAlign: "center",
        }}
      >
        {design.showPhoto && (
          <PreviewPortrait
            url={portraitUrl}
            size={landscape ? 58 : 62}
            shape={design.photoShape}
            primary={design.textColor}
            muted={design.surfaceColor}
          />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 6.5, opacity: 0.8, letterSpacing: ".2em" }}>
            {subtitle}
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 14 * design.nameScale,
              fontWeight: 800,
              lineHeight: 1.12,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </div>
        </div>
      </div>
    );
    content = (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: landscape ? "row" : "column",
        }}
      >
        {panel}
        <div
          style={{
            minWidth: 0,
            flex: 1,
            padding: density.pad,
            display: "flex",
            flexDirection: "column",
            gap: density.gap,
            background: splitSurfaceBackground,
          }}
        >
          <div>
            <div
              style={{
                color: design.primaryColor,
                fontSize: 7,
                fontWeight: 700,
                letterSpacing: ".16em",
              }}
            >
              {title}
            </div>
            <div
              style={{
                width: 28,
                height: 2,
                marginTop: 5,
                borderRadius: 2,
                background: design.primaryColor,
              }}
            />
          </div>
          <div style={{ minHeight: 0, flex: 1, overflow: "hidden" }}>
            <FieldList fields={otherFields} design={design} columns={landscape} />
          </div>
          <Verification design={design} />
        </div>
      </div>
    );
  } else if (design.layout === "centered") {
    content = (
      <div
        style={{
          width: "100%",
          height: "100%",
          padding: density.pad,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: density.gap,
          textAlign: "center",
        }}
      >
        <div>
          <div
            style={{
              color: design.primaryColor,
              fontSize: 7,
              fontWeight: 700,
              letterSpacing: ".24em",
            }}
          >
            {subtitle}
          </div>
          <div style={{ marginTop: 3, fontSize: 11, fontWeight: 750 }}>{title}</div>
        </div>
        {design.showPhoto && (
          <PreviewPortrait
            url={portraitUrl}
            size={landscape ? 54 : 70}
            shape={design.photoShape}
            primary={design.primaryColor}
            muted={design.surfaceColor}
          />
        )}
        <div style={{ ...nameStyle, width: "100%", textAlign: "center" }}>{name}</div>
        <div
          style={{
            width: 42,
            height: 2,
            flexShrink: 0,
            borderRadius: 2,
            background: design.primaryColor,
          }}
        />
        <div style={{ width: "100%", minHeight: 0, flex: 1, overflow: "hidden" }}>
          <FieldList
            fields={otherFields}
            design={design}
            centered
            columns={landscape}
          />
        </div>
        <Verification design={design} />
      </div>
    );
  } else if (design.layout === "editorial") {
    content = (
      <div
        style={{
          width: "100%",
          height: "100%",
          padding: density.pad,
          display: "flex",
          flexDirection: "column",
          gap: density.gap,
        }}
      >
        <div
          style={{
            minHeight: landscape ? 54 : 82,
            paddingRight: design.showPhoto ? (landscape ? 66 : 58) : 0,
          }}
        >
          <div
            style={{
              color: design.primaryColor,
              fontSize: 6.5,
              fontWeight: 750,
              letterSpacing: ".22em",
            }}
          >
            {subtitle}
          </div>
          <div
            style={{
              marginTop: 4,
              color: design.textColor,
              fontSize: landscape ? 15 : 18,
              fontWeight: 850,
              lineHeight: 1.05,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {title}
          </div>
          {design.showPhoto && (
            <div style={{ position: "absolute", top: density.pad, right: density.pad }}>
              <PreviewPortrait
                url={portraitUrl}
                size={landscape ? 50 : 54}
                shape={design.photoShape}
                primary={design.primaryColor}
                muted={design.surfaceColor}
              />
            </div>
          )}
        </div>
        <div
          style={{
            padding: "8px 0",
            borderTop: `3px solid ${design.primaryColor}`,
            borderBottom: `1px solid ${design.mutedColor}88`,
            ...nameStyle,
          }}
        >
          {name}
        </div>
        <div style={{ minHeight: 0, flex: 1, overflow: "hidden" }}>
          <FieldList fields={otherFields} design={design} columns={landscape} />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span
            style={{
              minWidth: 0,
              color: design.mutedColor,
              fontSize: 6.5,
              letterSpacing: ".14em",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </span>
          <Verification design={design} />
        </div>
      </div>
    );
  } else {
    content = (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            flexShrink: 0,
            padding: landscape ? "11px 16px 9px" : "16px 14px 11px",
            borderBottom: `1px solid ${design.mutedColor}66`,
            background: design.surfaceColor,
            textAlign: "center",
          }}
        >
          <div
            style={{
              color: design.primaryColor,
              fontSize: 6.5,
              fontWeight: 700,
              letterSpacing: ".22em",
            }}
          >
            {subtitle}
          </div>
          <div style={{ marginTop: 3, fontSize: 13, fontWeight: 780 }}>{title}</div>
        </header>
        <div
          style={{
            minHeight: 0,
            flex: 1,
            padding: density.pad,
            display: "flex",
            flexDirection: landscape ? "row" : "column",
            gap: density.gap,
          }}
        >
          {design.showPhoto && (
            <PreviewPortrait
              url={portraitUrl}
              size={landscape ? 58 : 52}
              shape={design.photoShape}
              primary={design.primaryColor}
              muted={design.surfaceColor}
            />
          )}
          <div
            style={{
              minWidth: 0,
              minHeight: 0,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: density.gap,
            }}
          >
            <div style={nameStyle}>{name}</div>
            <div
              style={{
                width: design.nameAlign === "center" ? "100%" : 32,
                height: 2,
                flexShrink: 0,
                background: design.primaryColor,
              }}
            />
            <div style={{ minHeight: 0, flex: 1, overflow: "hidden" }}>
              <FieldList fields={otherFields} design={design} columns={landscape} />
            </div>
            <Verification design={design} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: width * scale,
        height: height * scale,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <BadgeFrame design={design} width={width} height={height}>
          {content}
          {watermark && (
            <div
              data-ai-design-watermark
              style={{
                position: "absolute",
                right: 6,
                bottom: 5,
                zIndex: 4,
                maxWidth: "calc(100% - 12px)",
                padding: "2px 4px",
                border: `1px solid ${design.mutedColor}55`,
                borderRadius: 4,
                background: `${design.backgroundColor}D9`,
                color: design.textColor,
                fontSize: 5.5,
                fontWeight: 650,
                lineHeight: 1.2,
                letterSpacing: ".04em",
                opacity: 0.72,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                pointerEvents: "none",
              }}
            >
              {watermark}
            </div>
          )}
        </BadgeFrame>
      </div>
    </div>
  );
}
