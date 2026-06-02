import { useEffect, useState, useCallback } from "react";
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
  const { messages, streamingText, streaming, setHistory, sendStream } = useChat();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState("claude-sonnet-4-6");

  // 載入對話列表 + 模型清單
  useEffect(() => {
    load();
    listModels()
      .then((ms) => {
        setModels(ms);
        if (ms.length > 0) setSelectedModel(ms[0].id);
      })
      .catch(console.error);
  }, [load]);

  // 切換對話
  const selectConversation = useCallback(
    async (id: string) => {
      setActiveId(id);
      const detail = await getConversation(id);
      setHistory(detail.messages);
      setSelectedModel(detail.model);
    },
    [setHistory]
  );

  // 刪除對話
  const handleDelete = useCallback(
    async (id: string) => {
      await remove(id);
      if (activeId === id) {
        setActiveId(null);
        setHistory([]);
      }
    },
    [remove, activeId, setHistory]
  );

  // 新對話
  const handleNew = () => {
    setActiveId(null);
    setHistory([]);
  };

  // 送出訊息
  const handleSend = useCallback(
    async (content: string, images: string[]) => {
      if (streaming) return;

      let convId = activeId;

      // 第一則訊息：先建立對話
      if (!convId) {
        const conv = await createConversation(selectedModel, content || "新對話");
        convId = conv.id;
        setActiveId(convId);
        setConversations((prev) => [
          { id: conv.id, title: conv.title, model: conv.model, updated_at: conv.updated_at },
          ...prev,
        ]);
      }

      sendStream(
        convId,
        content,
        images.length > 0 ? images : undefined,
        selectedModel,
        // 有新訊息時更新 conversation updated_at 排序
        () => {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === convId ? { ...c, updated_at: new Date().toISOString() } : c
            ).sort((a, b) => (a.updated_at > b.updated_at ? -1 : 1))
          );
        }
      );
    },
    [streaming, activeId, selectedModel, sendStream, setConversations]
  );

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onDelete={handleDelete}
        onNew={handleNew}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">模型：</span>
            <ModelSelector
              models={models}
              selected={selectedModel}
              onChange={setSelectedModel}
            />
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            登出
          </button>
        </div>

        {/* 訊息區 */}
        <ChatWindow
          messages={messages}
          streamingText={streamingText}
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
