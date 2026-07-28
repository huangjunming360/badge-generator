import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Clock, FileText, ScanLine } from "lucide-react";
import { E, U } from "./shared";
import UserMenu from "./UserMenu";
import { fetchCards, fetchSchema } from "../../api/cards";
import { toFields } from "../../api/fields";
import { ApiError } from "../../api/client";
import type { CardPayload, SchemaFieldDef } from "../../api/types";

// 历史记录列表。对应原先 Rails 的 cards/index.html.erb。

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

export default function Page3() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<CardPayload[] | null>(null);
  const [schema, setSchema] = useState<SchemaFieldDef[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchCards(), fetchSchema()])
      .then(([list, s]) => {
        if (!alive) return;
        setCards(list);
        setSchema(s.fields);
      })
      .catch(e => {
        if (alive) setError(e instanceof ApiError ? e.message : "读取历史记录失败");
      });
    return () => { alive = false; };
  }, []);

  // 点进去直接带着数据去设计页，省一次往返。
  const open = (card: CardPayload) => {
    navigate("/design", {
      state: { rawText: card.raw_input ?? "", fields: toFields(card.fields, schema), cardId: card.id },
    });
  };

  return (
    <div style={{
      minHeight: "100vh", background: U.bg, color: U.text,
      fontFamily: "'Outfit',sans-serif",
    }}>
      <div style={{
        height: 52, background: U.surface, borderBottom: `1px solid ${U.border}`,
        display: "flex", alignItems: "center", padding: "0 20px", gap: 12,
        boxShadow: "0 1px 8px rgba(30,50,80,.05)",
      }}>
        <button onClick={() => navigate("/")} style={{
          display: "flex", alignItems: "center", gap: 5, padding: "6px 13px",
          borderRadius: 8, border: `1px solid ${U.border}`, background: U.bg,
          cursor: "pointer", fontSize: 12, color: U.textMid,
          transition: `all .16s ${E.smooth}`,
        }}>
          <ArrowLeft size={13} /> 新建
        </button>
        <div style={{ width: 1, height: 20, background: U.border }} />
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 600 }}>
          历史记录
        </div>
        {cards && (
          <div style={{ fontSize: 11, color: U.textFaint }}>共 {cards.length} 条</div>
        )}
        <div style={{ flex: 1 }} />
        <UserMenu />
      </div>

      {error && (
        <div style={{
          padding: "8px 20px", background: "#FDF0F2", borderBottom: "1px solid #F0D4DA",
          fontSize: 11.5, color: "#8A3448",
        }}>{error}</div>
      )}

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px 64px" }}>
        {cards === null && !error && (
          <div style={{ fontSize: 12, color: U.textLight, textAlign: "center", padding: "40px 0" }}>
            加载中…
          </div>
        )}

        {cards?.length === 0 && (
          <div style={{ fontSize: 12, color: U.textLight, textAlign: "center", padding: "40px 0" }}>
            还没有记录。回到首页粘贴一段资料试试。
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {cards?.map((card, i) => (
            <button key={card.id} onClick={() => open(card)} style={{
              textAlign: "left", cursor: "pointer", padding: "13px 16px",
              borderRadius: 12, border: `1px solid ${U.border}`, background: U.surface,
              display: "flex", alignItems: "center", gap: 14,
              animation: `fadeSlideIn .3s ${E.smooth} ${i * 40}ms both`,
              transition: `border-color .18s ${E.smooth}, box-shadow .18s ${E.smooth}`,
            }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = U.blue + "55";
                e.currentTarget.style.boxShadow = "0 3px 14px rgba(58,118,196,.10)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = U.border;
                e.currentTarget.style.boxShadow = "none";
              }}>
              {card.portrait ? (
                <img src={card.portrait.url} alt="" style={{
                  width: 38, height: 53, objectFit: "cover", borderRadius: 5,
                  border: `1px solid ${U.borderLight}`, flexShrink: 0,
                }} />
              ) : (
                <div style={{
                  width: 38, height: 53, borderRadius: 5, flexShrink: 0,
                  border: `1px dashed ${U.border}`, background: U.bg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, color: U.textFaint,
                }}>无照</div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 3 }}>
                  {card.fields.name || <span style={{ color: U.textFaint }}>未识别姓名</span>}
                </div>
                <div style={{
                  fontSize: 11, color: U.textMid, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {card.fields.organization || "—"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: U.textFaint }}>
                    <Clock size={9} /> {formatTime(card.created_at)}
                  </span>
                  {card.source_name && (
                    <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: U.textFaint }}>
                      <FileText size={9} /> {card.source_name}
                    </span>
                  )}
                  {card.used_ocr && (
                    <span style={{
                      display: "flex", alignItems: "center", gap: 3, fontSize: 10,
                      color: "#8A6A20", background: "#FBF3E0", padding: "1px 6px", borderRadius: 99,
                    }}>
                      <ScanLine size={9} /> OCR
                    </span>
                  )}
                </div>
              </div>

              <div style={{ fontSize: 10.5, color: U.textFaint, flexShrink: 0, textAlign: "right" }}>
                <div>{card.filled_count} 个字段</div>
                <div style={{ marginTop: 2 }}>{card.width_mm}×{card.height_mm}mm</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
