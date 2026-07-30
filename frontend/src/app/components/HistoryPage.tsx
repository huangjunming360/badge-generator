import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Clock, User, FileText } from "lucide-react";
import { U, E } from "./shared";
import { useAuth } from "./useAuth";

interface HistoryCard {
  id: number;
  created_at: string;
  fields: Record<string, string>;
  portrait?: { url: string };
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [cards, setCards] = useState<HistoryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    // 获取历史记录
    fetch("/api/v1/cards", {
      credentials: "include",
    })
      .then(res => {
        if (!res.ok) throw new Error("获取历史记录失败");
        return res.json();
      })
      .then(data => {
        setCards(data.cards || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [user, navigate]);

  const goBack = () => navigate("/");

  return (
    <div style={{
      minHeight: "100vh", background: U.bg,
      fontFamily: "'Outfit',sans-serif", color: U.text,
    }}>
      {/* 顶部栏 */}
      <div style={{
        height: 56, background: U.surface, borderBottom: `1px solid ${U.border}`,
        display: "flex", alignItems: "center", padding: "0 20px", gap: 12,
        boxShadow: "0 1px 8px rgba(30,50,80,.05)",
      }}>
        <button onClick={goBack} style={{
          display: "flex", alignItems: "center", gap: 5, padding: "6px 13px",
          borderRadius: 8, border: `1px solid ${U.border}`,
          background: U.bg, cursor: "pointer", fontSize: 12, color: U.textMid,
          transition: `all .16s ${E.smooth}`,
        }}
          onMouseEnter={e => {
            e.currentTarget.style.color = U.blue;
            e.currentTarget.style.borderColor = U.blue + "55";
            e.currentTarget.style.background = U.blueXLight;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = U.textMid;
            e.currentTarget.style.borderColor = U.border;
            e.currentTarget.style.background = U.bg;
          }}>
          <ArrowLeft size={13} /> 返回
        </button>

        <div style={{ width: 1, height: 20, background: U.border }} />

        <div style={{
          fontFamily: "'Playfair Display',serif",
          fontSize: 15, fontWeight: 600, color: U.text,
        }}>
          历史记录
        </div>
      </div>

      {/* 内容区 */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 20px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: U.textLight }}>
            加载中...
          </div>
        )}

        {error && (
          <div style={{
            padding: "16px 20px", borderRadius: 10,
            background: "#FEE", border: "1px solid #FCC",
            color: "#C33", fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {!loading && !error && cards.length === 0 && (
          <div style={{
            textAlign: "center", padding: "60px 20px",
            color: U.textLight, fontSize: 14,
          }}>
            <Clock size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
            <div>暂无历史记录</div>
          </div>
        )}

        {!loading && !error && cards.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 20,
          }}>
            {cards.map(card => (
              <CardItem key={card.id} card={card} onClick={() => navigate("/design", {
                state: { cardId: card.id }
              })} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CardItem({ card, onClick }: { card: HistoryCard; onClick: () => void }) {
  const name = card.fields.name || "未命名";
  const date = new Date(card.created_at).toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div
      onClick={onClick}
      style={{
        background: U.surface, borderRadius: 12,
        border: `1px solid ${U.border}`,
        padding: 16, cursor: "pointer",
        transition: `all .2s ${E.smooth}`,
        boxShadow: "0 2px 8px rgba(0,0,0,.04)",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = U.blue + "55";
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(58,118,196,.12)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = U.border;
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,.04)";
      }}
    >
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        {card.portrait?.url ? (
          <img src={card.portrait.url} alt="" style={{
            width: 48, height: 48, borderRadius: 8,
            objectFit: "cover", background: U.bg,
          }} />
        ) : (
          <div style={{
            width: 48, height: 48, borderRadius: 8,
            background: U.bg, display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>
            <User size={24} color={U.textLight} />
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 600, color: U.text,
            marginBottom: 4, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {name}
          </div>
          <div style={{
            fontSize: 11, color: U.textLight,
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <Clock size={10} />
            {date}
          </div>
        </div>
      </div>

      {Object.entries(card.fields).filter(([k]) => k !== "name").slice(0, 3).map(([key, value]) => (
        <div key={key} style={{
          fontSize: 11, color: U.textMid,
          padding: "4px 0", borderTop: `1px solid ${U.borderLight}`,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          <span style={{ color: U.textLight }}>{key}:</span> {value}
        </div>
      ))}
    </div>
  );
}
