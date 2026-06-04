import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { ChatWindow } from "../components/ChatWindow";
import { InputBar } from "../components/InputBar";
import { ModelSelector } from "../components/ModelSelector";
import { useConversations } from "../hooks/useConversations";
import { useChat } from "../hooks/useChat";
import { createConversation, getConversation, listModels, exportPptx } from "../services/api";
import type { ModelInfo, Message } from "../types";
import { Download } from "lucide-react";

export function Chat() {
  const navigate = useNavigate();
  const { conversations, setConversations, loadError, load, remove } = useConversations();
  const { messages, streamingText, toolStatus, streaming, streamError, setHistory, sendStream, abort } = useChat();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-4-6");
  const [modelsError, setModelsError] = useState(false);
  const [exportingPptx, setExportingPptx] = useState(false);
  const [pptxError, setPptxError] = useState<string>("");

  // F-C3: 用 ref 追蹤「目前應顯示哪個對話」，防止 race condition
  const activeIdRef = useRef<string | null>(null);

  // 載入對話列表 + 模型清單
  useEffect(() => {
    load();
    listModels()
      .then((ms) => {
        setModels(ms);
        if (ms.length > 0) setSelectedModel(ms[0].id);
      })
      .catch(() => {
        setModelsError(true);
      });
  }, [load]);

  // 切換對話 — FC-1: 先 abort 舊 stream，FC-3 race condition 防護
  const selectConversation = useCallback(
    async (id: string) => {
      abort(); // FC-1: 先 abort 舊 stream，防止舊對話訊息追加到新對話
      setActiveId(id);
      activeIdRef.current = id;
      try {
        const detail = await getConversation(id);
        // 只有還是同一個對話才更新（防止慢速 response 覆蓋新選擇）
        if (activeIdRef.current === id) {
          setHistory(detail.messages);
          setSelectedModel(detail.model);
        }
      } catch (err) {
        console.error("載入對話失敗", err);
      }
    },
    [setHistory, abort]
  );

  // 刪除對話
  const handleDelete = useCallback(
    async (id: string) => {
      await remove(id);
      if (activeId === id) {
        abort(); // F-W: 刪除當前對話也 abort streaming
        setActiveId(null);
        activeIdRef.current = null;
        setHistory([]);
      }
    },
    [remove, activeId, setHistory, abort]
  );

  // 新對話 — F-S: 同時 abort 進行中的 stream
  const handleNew = () => {
    abort();
    setActiveId(null);
    activeIdRef.current = null;
    setHistory([]);
  };

  // 送出訊息
  const handleSend = useCallback(
    async (content: string, images: string[], fileContext?: string) => {
      if (streaming) return;

      let convId = activeId;

      // 第一則訊息：先建立對話
      if (!convId) {
        try {
          const conv = await createConversation(selectedModel, content || "新對話");
          convId = conv.id;
          setActiveId(convId);
          activeIdRef.current = convId;
          setConversations((prev) => [
            { id: conv.id, title: conv.title, model: conv.model, updated_at: conv.updated_at },
            ...prev,
          ]);
        } catch (err) {
          console.error("建立對話失敗", err);
          return; // F-W: 建立失敗就不繼續送 stream
        }
      }

      sendStream(
        convId,
        content,
        images.length > 0 ? images : undefined,
        selectedModel,
        () => {
          setConversations((prev) =>
            prev
              .map((c) =>
                c.id === convId ? { ...c, updated_at: new Date().toISOString() } : c
              )
              .sort((a, b) => (a.updated_at > b.updated_at ? -1 : 1))
          );
        },
        fileContext,
      );
    },
    [streaming, activeId, selectedModel, sendStream, setConversations]
  );

  // 產圖完成 → 直接把圖片塞進 messages（不走 AI stream）
  const handleImageGenerated = useCallback(
    async (prompt: string, imageUrl: string) => {
      let convId = activeId;

      // 若沒有對話，先建立一個
      if (!convId) {
        try {
          const conv = await createConversation(selectedModel, prompt);
          convId = conv.id;
          setActiveId(convId);
          activeIdRef.current = convId;
          setConversations((prev) => [
            { id: conv.id, title: conv.title, model: conv.model, updated_at: conv.updated_at },
            ...prev,
          ]);
        } catch (err) {
          console.error("建立對話失敗", err);
          return;
        }
      }

      const now = new Date().toISOString();
      // 在本地 messages 加上 user prompt + assistant 圖片（UI only，不存 DB）
      const userMsg: Message = {
        id: `local-user-${Date.now()}`,
        conversation_id: convId,
        role: "user",
        content: `🎨 產圖：${prompt}`,
        created_at: now,
      };
      const assistantMsg: Message = {
        id: `local-assistant-${Date.now()}`,
        conversation_id: convId,
        role: "assistant",
        content: "",
        images: [imageUrl],
        created_at: now,
      };
      setHistory([...messages, userMsg, assistantMsg]);
    },
    [activeId, selectedModel, messages, setHistory, setConversations]
  );

  const handleLogout = () => {
    abort();
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };

  const handleExportPptx = useCallback(async () => {
    if (messages.length === 0 || exportingPptx) return;
    setPptxError("");
    setExportingPptx(true);

    // 把目前對話摘要成一句 prompt
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const prompt = lastAssistant
      ? `根據以下對話內容產出投影片：${lastAssistant.content.slice(0, 500)}`
      : "根據對話產出投影片";

    try {
      const blob = await exportPptx(prompt, 5);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "yangchat-export.pptx";
      a.click();
      // FW-6: setTimeout 避免 Safari 在下載觸發前就 revoke
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (err: unknown) {
      setPptxError((err as Error).message || "匯出失敗");
      setTimeout(() => setPptxError(""), 4000);
    } finally {
      setExportingPptx(false);
    }
  }, [messages, exportingPptx]);

  return (
    <div className="flex h-screen" style={{ backgroundColor: "#08090a", color: "#f0f1f3" }}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onDelete={handleDelete}
        onNew={handleNew}
        loadError={loadError}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-3"
          style={{
            backgroundColor: "#0a0b10",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div className="flex items-center gap-3">
            {modelsError ? (
              <span className="text-red-400 text-[13px]">模型載入失敗，請重新整理</span>
            ) : (
              <ModelSelector
                models={models}
                selected={selectedModel}
                onChange={setSelectedModel}
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            {pptxError && (
              <span className="text-red-400 text-xs">{pptxError}</span>
            )}
            {/* PPTX 匯出按鈕 */}
            {messages.length > 0 && (
              <button
                onClick={handleExportPptx}
                disabled={exportingPptx || streaming}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ color: "#9499a5", border: "1px solid rgba(255,255,255,0.1)" }}
                onMouseEnter={(e) => {
                  if (!exportingPptx && !streaming) {
                    (e.currentTarget as HTMLButtonElement).style.color = "#f0f1f3";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.2)";
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = "#9499a5";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.1)";
                }}
                title="將對話匯出為 PowerPoint"
              >
                <Download size={13} />
                {exportingPptx ? "產生中..." : "匯出 PPTX"}
              </button>
            )}
            <button
              onClick={handleLogout}
              className="text-[13px] transition-colors duration-150"
              style={{ color: "#62666d" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.color = "#9499a5")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.color = "#62666d")
              }
            >
              登出
            </button>
          </div>
        </div>

        {/* 訊息區 */}
        {streamError && (
          <div className="px-6 py-2" style={{ backgroundColor: "rgba(239,68,68,0.1)", borderBottom: "1px solid rgba(239,68,68,0.2)" }}>
            <p className="text-red-400 text-sm text-center">{streamError}</p>
          </div>
        )}
        <ChatWindow
          messages={messages}
          streamingText={streamingText}
          toolStatus={toolStatus}
          isStreaming={streaming}
        />

        {/* 輸入框 */}
        <InputBar
          disabled={streaming}
          onSend={handleSend}
          onImageGenerated={handleImageGenerated}
        />
      </div>
    </div>
  );
}
