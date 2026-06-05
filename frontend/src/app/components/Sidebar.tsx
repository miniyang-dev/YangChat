import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Plus, Search, X, Clock, User, Bot, Zap, Settings } from "lucide-react";
import type { Conversation } from "../types";
import { searchMessages } from "../services/api";
import type { SearchResult, BillingUsage } from "../services/api";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
  loadError?: string;
  usage?: BillingUsage | null;
  isAdmin?: boolean;
}

// snippet 中的 **keyword** 轉為 <mark> 高亮
function SnippetHighlight({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <mark
            key={i}
            style={{ backgroundColor: "rgba(94,106,210,0.35)", color: "#c7caff", borderRadius: "2px", padding: "0 2px" }}
          >
            {part.slice(2, -2)}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

export function Sidebar({ conversations, activeId, onSelect, onDelete, onNew, loadError, usage, isAdmin }: Props) {
  const navigate = useNavigate();
  const [searchMode, setSearchMode] = useState(false);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "user" | "assistant">("all");
  const [date, setDate] = useState<"all" | "today" | "week" | "month">("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 進入搜尋模式後 focus 搜尋框
  useEffect(() => {
    if (searchMode) inputRef.current?.focus();
  }, [searchMode]);

  const doSearch = useCallback(async (q: string, sc: typeof scope, dt: typeof date) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    setSearchError("");
    try {
      const res = await searchMessages({ q: q.trim(), scope: sc, date: dt, limit: 20 });
      setResults(res);
    } catch {
      setSearchError("搜尋失敗，請稍後再試");
    } finally {
      setSearching(false);
    }
  }, []);

  // debounce 輸入，300ms 後才發請求
  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val, scope, date), 300);
  };

  const handleScopeChange = (val: typeof scope) => {
    setScope(val);
    doSearch(query, val, date);
  };

  const handleDateChange = (val: typeof date) => {
    setDate(val);
    doSearch(query, scope, val);
  };

  const exitSearch = () => {
    setSearchMode(false);
    setQuery("");
    setResults([]);
    setSearchError("");
  };

  // 點擊搜尋結果 → 跳到該對話
  const handleResultClick = (convId: string) => {
    onSelect(convId);
    exitSearch();
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });
    } catch { return ""; }
  };

  return (
    <div
      className="w-[220px] flex-shrink-0 flex flex-col h-full"
      style={{ backgroundColor: "#0f1011", borderRight: "1px solid rgba(255,255,255,0.07)" }}
    >
      {/* App header */}
      <div className="px-4 py-4 flex items-center gap-2">
        <span className="text-[#5e6ad2] text-sm select-none">✦</span>
        <span className="text-[13px] font-semibold tracking-tight" style={{ color: "#f0f1f3", letterSpacing: "-0.01em" }}>
          YangChat
        </span>
      </div>

      {/* 搜尋模式切換按鈕列 */}
      <div className="px-3 pb-2 flex gap-2">
        {!searchMode ? (
          <>
            <button
              onClick={onNew}
              className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg text-white text-[13px] font-medium transition-all duration-150"
              style={{ backgroundColor: "#5e6ad2", boxShadow: "0 1px 3px rgba(94,106,210,0.3), 0 0 0 1px rgba(94,106,210,0.2)" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#6e7ae0"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(94,106,210,0.4), 0 0 0 1px rgba(94,106,210,0.3)"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#5e6ad2"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(94,106,210,0.3), 0 0 0 1px rgba(94,106,210,0.2)"; }}
            >
              <Plus size={14} />
              新對話
            </button>
            <button
              data-testid="search-toggle"
              onClick={() => setSearchMode(true)}
              className="flex items-center justify-center px-2 py-2 rounded-lg transition-all duration-150"
              style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#9499a5" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#f0f1f3"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#9499a5"; }}
              title="搜尋歷史紀錄"
            >
              <Search size={14} />
            </button>
          </>
        ) : (
          /* 搜尋模式：輸入框 + 關閉 */
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="flex items-center gap-1">
              <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg" style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
                <Search size={12} style={{ color: "#9499a5", flexShrink: 0 }} />
                <input
                  ref={inputRef}
                  data-testid="search-input"
                  value={query}
                  onChange={e => handleQueryChange(e.target.value)}
                  placeholder="搜尋歷史紀錄..."
                  className="flex-1 bg-transparent outline-none text-[12px] min-w-0"
                  style={{ color: "#f0f1f3" }}
                />
                {query && (
                  <button onClick={() => handleQueryChange("")} style={{ color: "#62666d" }}>
                    <X size={11} />
                  </button>
                )}
              </div>
              <button
                onClick={exitSearch}
                className="flex-shrink-0 px-1.5 py-1.5 rounded-lg text-[11px] transition-all"
                style={{ color: "#9499a5" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                onMouseLeave={e => (e.currentTarget.style.color = "#9499a5")}
              >
                <X size={13} />
              </button>
            </div>

            {/* 篩選列：scope + date */}
            <div className="flex gap-1">
              <select
                data-testid="search-scope"
                value={scope}
                onChange={e => handleScopeChange(e.target.value as typeof scope)}
                className="flex-1 text-[10px] rounded px-1 py-0.5 outline-none cursor-pointer"
                style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#9499a5", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <option value="all">全部角色</option>
                <option value="user">我的提問</option>
                <option value="assistant">AI 回覆</option>
              </select>
              <select
                data-testid="search-date"
                value={date}
                onChange={e => handleDateChange(e.target.value as typeof date)}
                className="flex-1 text-[10px] rounded px-1 py-0.5 outline-none cursor-pointer"
                style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "#9499a5", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <option value="all">所有時間</option>
                <option value="today">今天</option>
                <option value="week">近一週</option>
                <option value="month">近一月</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* 主內容區：搜尋模式 or 對話列表 */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-3">
        {searchMode ? (
          /* ── 搜尋結果 ── */
          <>
            {searching && (
              <p className="text-[11px] text-center mt-3" style={{ color: "#62666d" }}>搜尋中...</p>
            )}
            {searchError && (
              <p className="text-[11px] text-center mt-3 px-2" style={{ color: "#f87171" }}>{searchError}</p>
            )}
            {!searching && !searchError && query && results.length === 0 && (
              <p className="text-[11px] text-center mt-3" style={{ color: "#62666d" }}>無符合結果</p>
            )}
            {!searching && !query && (
              <p className="text-[11px] text-center mt-3" style={{ color: "#62666d" }}>輸入關鍵字開始搜尋</p>
            )}
            {results.map((r, i) => (
              <div
                key={`${r.message_id}-${i}`}
                data-testid="search-result"
                onClick={() => handleResultClick(r.conversation_id)}
                className="px-2 py-2 rounded-lg cursor-pointer transition-all duration-150"
                style={{ color: "#9499a5" }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent"; }}
              >
                {/* 對話標題 */}
                <p className="text-[11px] font-medium truncate mb-0.5" style={{ color: "#d0d4dc" }}>
                  {r.conversation_title}
                </p>
                {/* snippet 高亮 */}
                <p className="text-[10px] leading-relaxed line-clamp-2" style={{ color: "#6b7280" }}>
                  <SnippetHighlight text={r.snippet} />
                </p>
                {/* 底部：角色 + 時間 */}
                <div className="flex items-center gap-1.5 mt-1">
                  {r.role === "user"
                    ? <User size={9} style={{ color: "#5e6ad2" }} />
                    : <Bot  size={9} style={{ color: "#10b981" }} />
                  }
                  <span className="text-[9px]" style={{ color: "#4b5563" }}>
                    {r.role === "user" ? "我" : "AI"}
                  </span>
                  <Clock size={9} style={{ color: "#4b5563" }} />
                  <span className="text-[9px]" style={{ color: "#4b5563" }}>{formatDate(r.created_at)}</span>
                </div>
              </div>
            ))}
          </>
        ) : (
          /* ── 對話列表 ── */
          <>
            {loadError && (
              <p className="text-[12px] text-center mt-4 px-2" style={{ color: "#f87171" }}>{loadError}</p>
            )}
            {!loadError && conversations.length === 0 && (
              <p className="text-[12px] text-center mt-4" style={{ color: "#62666d" }}>尚無對話</p>
            )}
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150"
                style={
                  conv.id === activeId
                    ? { backgroundColor: "rgba(94,106,210,0.12)", color: "#f0f1f3", boxShadow: "inset 2px 0 0 #5e6ad2" }
                    : { color: "#9499a5" }
                }
                onMouseEnter={e => {
                  if (conv.id !== activeId) {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = "rgba(255,255,255,0.04)";
                    (e.currentTarget as HTMLDivElement).style.color = "#d0d4dc";
                  }
                }}
                onMouseLeave={e => {
                  if (conv.id !== activeId) {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
                    (e.currentTarget as HTMLDivElement).style.color = "#9499a5";
                  }
                }}
                onClick={() => onSelect(conv.id)}
              >
                <span className="flex-1 text-[13px] truncate">{conv.title}</span>
                <button
                  onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-all duration-150 flex-shrink-0"
                  style={{ color: "#62666d" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#62666d")}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── 底部 footer ── */}
      <div className="flex-shrink-0">
        {/* Admin 入口（僅 admin 可見） */}
        {isAdmin && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }} className="px-3 py-2">
            <button
              onClick={() => navigate("/admin")}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-left"
              style={{ color: "#62666d" }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "rgba(255,255,255,0.05)";
                (e.currentTarget as HTMLButtonElement).style.color = "#d0d4dc";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                (e.currentTarget as HTMLButtonElement).style.color = "#62666d";
              }}
            >
              <Settings size={14} />
              <span className="text-[12px]">帳號管理</span>
            </button>
          </div>
        )}
        {/* 用量 bar */}
        {usage && <UsageBar usage={usage} />}
      </div>
    </div>
  );
}

// ── UsageBar ────────────────────────────────────────────────────────────────
function UsageBar({ usage }: { usage: BillingUsage }) {
  const pct = Math.min(usage.usage_pct * 100, 100);
  const isHigh = pct >= 80;
  const isMid  = pct >= 50;

  // 進度條顏色：正常藍紫 → 中段橘 → 高段紅
  const barColor = isHigh ? "#f87171" : isMid ? "#fb923c" : "#5e6ad2";

  const fmtCredit = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${n.toFixed(2)}`;

  return (
    <div
      style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
      className="px-4 py-3 flex-shrink-0"
    >
      {/* 上排：icon + 方案 + 百分比 */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <Zap size={11} style={{ color: barColor }} />
          <span className="text-[11px] font-medium" style={{ color: "#9499a5" }}>
            {usage.plan_name}
          </span>
        </div>
        <span
          className="text-[10px] tabular-nums"
          style={{ color: isHigh ? "#f87171" : "#62666d" }}
        >
          {pct.toFixed(0)}%
        </span>
      </div>

      {/* 進度條 */}
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: "3px", backgroundColor: "rgba(255,255,255,0.08)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>

      {/* 下排：剩餘 credits */}
      <p className="mt-1.5 text-[10px]" style={{ color: "#4b5563" }}>
        剩餘&nbsp;
        <span style={{ color: "#62666d" }}>{fmtCredit(usage.credits_remaining)}</span>
        &nbsp;/&nbsp;{fmtCredit(usage.credits_limit)}
      </p>
    </div>
  );
}
