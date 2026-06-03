import { useState, useCallback } from "react";
import type { Conversation } from "../types";
import * as api from "../services/api";

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  // FC-4: 對話列表載入失敗時顯示錯誤，不再靜默
  const [loadError, setLoadError] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await api.listConversations();
      setConversations(data);
    } catch (err: unknown) {
      // FC-4: 載入失敗要通知使用者，不能只留空列表
      setLoadError("無法載入對話列表，請重新整理");
      console.error("載入對話列表失敗", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch (err: unknown) {
      // FW-3: 避免 unhandled rejection
      console.error("刪除對話失敗", err);
      throw err; // 向上拋讓 handleDelete 可以處理
    }
  }, []);

  return { conversations, setConversations, loading, loadError, load, remove };
}
