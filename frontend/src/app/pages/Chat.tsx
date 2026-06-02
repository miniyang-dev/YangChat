import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { ChatWindow } from "../components/ChatWindow";
import { InputBar } from "../components/InputBar";
import { ModelSelector } from "../components/ModelSelector";
import { useConversations } from "../hooks/useConversations";
import { useChat } from "../hooks/useChat";
import { createConversation, getConversation, listModels } from "../services/api";
import type { ModelInfo } from "../types";

export function Chat() {
  const navigate = useNavigate();
  const { conversations, setConversations, load, remove } = useConversations();
  const { messages, streamingText, toolStatus, streaming, setHistory, sendStream, abort } = useChat();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-4-6");
  const [modelsError, setModelsError] = useState(false);

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

  // 切換對話 — F-C3: race condition 防護
  const selectConversation = useCallback(
    async (id: string) => {
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
    [setHistory]
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
    async (content: string, images: string[]) => {
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
        }
      );
    },
    [streaming, activeId, selectedModel, sendStream, setConversations]
  );

  const handleLogout = () => {
    abort();
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-screen" style={{ backgroundColor: "#08090a", color: "#f0f1f3" }}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onDelete={handleDelete}
        onNew={handleNew}
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

        {/* 訊息區 */}
        <ChatWindow
          messages={messages}
          streamingText={streamingText}
          toolStatus={toolStatus}
          isStreaming={streaming}
        />

        {/* 輸入框 */}
        <InputBar
          models={models}
          selectedModel={selectedModel}
          disabled={streaming}
          onSend={handleSend}
        />
      </div>
    </div>
  );
}
