import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Clock, FileText, ScanLine, Trash2, CheckSquare } from "lucide-react";
import { E, U, usePress } from "./shared";
import UserMenu from "./UserMenu";
import { fetchCards, fetchSchema, deleteCard, batchDeleteCards } from "../../api/cards";
import { toFields } from "../../api/fields";
import { ApiError } from "../../api/client";
import type { CardPayload, SchemaFieldDef } from "../../api/types";

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function Page3() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<CardPayload[] | null>(null);
  const [schema, setSchema] = useState<SchemaFieldDef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  const load = () => {
    Promise.all([fetchCards(), fetchSchema()])
      .then(([list, s]) => { setCards(list); setSchema(s.fields); })
      .catch(e => setError(e instanceof ApiError ? e.message : "读取历史记录失败"));
  };

  useEffect(load, []);

  const open = (card: CardPayload) => {
    if (selectMode) { toggle(card.id); return; }
    navigate("/design", {
      state: { rawText: card.raw_input ?? "", fields: toFields(card.fields, schema), cardId: card.id,
        portraitUrl: card.portrait?.url, imgName: card.portrait ? ("📷 " + card.portrait.filename) : null },
    });
  };

  const toggle = (id: number) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const doDelete = async (id: number) => {
    if (!confirm("确定删除此记录？")) return;
    try { await deleteCard(id); load(); } catch (e) { setError("删除失败"); }
  };

  const doBatchDelete = async () => {
    if (!selected.size) return;
    if (!confirm(`确定删除选中的 ${selected.size} 条记录？`)) return;
    try { await batchDeleteCards([...selected]); setSelected(new Set()); setSelectMode(false); load(); }
    catch (e) { setError("批量删除失败"); }
  };

  const { hovered, bind } = usePress();

  return (
    <div style={{ minHeight: "100vh", background: U.bg, color: U.text, fontFamily: "'Outfit',sans-serif" }}>
      {/* ── Sticky header ─────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        height: 52, background: U.surface, borderBottom: `1px solid ${U.border}`,
        display: "flex", alignItems: "center", padding: "0 20px", gap: 12,
        boxShadow: "0 1px 8px rgba(30,50,80,.05)",
      }}>
        <button onClick={() => navigate("/")} style={{
          display: "flex", alignItems: "center", gap: 5, padding: "6px 13px",
          borderRadius: 8, border: `1px solid ${U.border}`, background: U.bg,
          cursor: "pointer", fontSize: 12, color: U.textMid,
        }}>
          <ArrowLeft size={13} /> 返回
        </button>
        <div style={{ width: 1, height: 20, background: U.border }} />
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, fontWeight: 600 }}>
          历史记录
        </div>
        {cards && <span style={{ fontSize: 11, color: U.textFaint }}>共 {cards.length} 条</span>}
        <div style={{ flex: 1 }} />

        {selectMode ? (
          <>
            <button onClick={() => {
              if (cards) setSelected(new Set(cards.map(c => c.id)));
            }} style={{
              fontSize: 11, color: U.blue, background: "none", border: "none",
              cursor: "pointer", padding: "4px 8px",
            }}>全选</button>
            <span style={{ fontSize: 11, color: U.textMid }}>已选 {selected.size} 项</span>
            {selected.size > 0 && (
              <button onClick={doBatchDelete} style={{
                display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
                borderRadius: 6, border: "none", background: "#FDF0F2", color: "#C0392B",
                cursor: "pointer", fontSize: 11,
              }}>
                <Trash2 size={11} /> 删除
              </button>
            )}
            <button onClick={() => { setSelectMode(false); setSelected(new Set()); }} style={{
              padding: "5px 10px", borderRadius: 6, border: `1px solid ${U.border}`,
              background: "transparent", cursor: "pointer", fontSize: 11, color: U.textMid,
            }}>取消</button>
          </>
        ) : (
          <button onClick={() => setSelectMode(true)} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "5px 10px",
            borderRadius: 6, border: `1px solid ${U.border}`, background: "transparent",
            cursor: "pointer", fontSize: 11, color: U.textMid,
          }}>
            <CheckSquare size={11} /> 选择
          </button>
        )}

        <UserMenu />
      </div>

      {error && (
        <div style={{ padding: "8px 20px", background: "#FDF0F2", borderBottom: "1px solid #F0D4DA", fontSize: 11.5, color: "#8A3448" }}>
          {error} <button onClick={() => setError(null)} style={{ marginLeft: 8, border: "none", background: "none", cursor: "pointer", color: "#8A3448", textDecoration: "underline" }}>关闭</button>
        </div>
      )}

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 20px 64px" }}>
        {cards === null && !error && (
          <div style={{ fontSize: 12, color: U.textLight, textAlign: "center", padding: "40px 0" }}>加载中…</div>
        )}
        {cards?.length === 0 && (
          <div style={{ fontSize: 12, color: U.textLight, textAlign: "center", padding: "40px 0" }}>还没有记录。</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {cards?.map((card, i) => (
            <div key={card.id} style={{
              display: "flex", alignItems: "stretch", gap: 0,
              animation: `fadeSlideIn .3s ${E.smooth} ${i * 40}ms both`,
            }}>
              {selectMode && (
                <button onClick={() => toggle(card.id)} style={{
                  padding: "0 10px", border: `1px solid ${selected.has(card.id) ? U.blue : U.border}`,
                  borderRight: "none", borderRadius: "12px 0 0 12px",
                  background: selected.has(card.id) ? U.blueXLight : U.surface,
                  cursor: "pointer", display: "flex", alignItems: "center",
                }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: 4,
                    border: `2px solid ${selected.has(card.id) ? U.blue : U.border}`,
                    background: selected.has(card.id) ? U.blue : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: `all .12s ${E.smooth}`,
                  }}>
                    {selected.has(card.id) && <span style={{ color: "#fff", fontSize: 10 }}>✓</span>}
                  </div>
                </button>
              )}
              <button onClick={() => open(card)} style={{
                flex: 1, textAlign: "left", cursor: "pointer", padding: "13px 16px",
                borderRadius: selectMode ? "0 12px 12px 0" : 12,
                border: `1px solid ${U.border}`, background: U.surface,
                display: "flex", alignItems: "center", gap: 14,
                transition: `border-color .18s ${E.smooth}, box-shadow .18s ${E.smooth}`,
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = U.blue + "55"; e.currentTarget.style.boxShadow = "0 3px 14px rgba(58,118,196,.10)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = U.border; e.currentTarget.style.boxShadow = "none"; }}>
                {card.portrait ? (
                  <img src={card.portrait.url} alt="" style={{ width: 38, height: 53, objectFit: "cover", borderRadius: 5, border: `1px solid ${U.borderLight}`, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 38, height: 53, borderRadius: 5, flexShrink: 0, border: `1px dashed ${U.border}`, background: U.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: U.textFaint }}>无照</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 3 }}>
                    {card.fields.name || <span style={{ color: U.textFaint }}>未识别姓名</span>}
                  </div>
                  <div style={{ fontSize: 11, color: U.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: "#8A6A20", background: "#FBF3E0", padding: "1px 6px", borderRadius: 99 }}>
                        <ScanLine size={9} /> OCR
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 10.5, color: U.textFaint, flexShrink: 0, textAlign: "right" }}>
                  <div>{card.filled_count} 个字段</div>
                  <div style={{ marginTop: 2 }}>{card.width_mm}×{card.height_mm}mm</div>
                </div>
                {!selectMode && (
                  <button onClick={e => { e.stopPropagation(); doDelete(card.id); }} style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: U.textFaint, padding: 4, fontSize: 14, lineHeight: 1,
                    opacity: 0, transition: `opacity .12s ${E.smooth}`,
                  }} className="del-btn"
                    onMouseEnter={e => { const btn = (e.target as HTMLElement).closest("button"); if (btn) btn.style.opacity = "1"; btn!.style.color = "#C0392B"; }}
                    onMouseLeave={e => { const btn = (e.target as HTMLElement).closest("button"); if (btn) btn.style.opacity = "0"; }}>
                    ×
                  </button>
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
      <style>{".del-btn { opacity: 0 } tr:hover .del-btn, div:hover > .del-btn { opacity: 1 !important }"}</style>
    </div>
  );
}
