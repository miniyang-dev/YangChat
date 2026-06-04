import { useState, useRef, useCallback } from "react";
import type { Message } from "../types";
import * as api from "../services/api";

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [toolStatus, setToolStatus] = useState<string>("");   // 「🔍 搜尋中...」
  // FC-2: stream 錯誤要顯示給使用者
  const [streamError, setStreamError] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const setHistory = useCallback((msgs: Message[]) => {
    setMessages(msgs);
    setStreamingText("");
    setToolStatus("");
    setStreamError("");
  }, []);

  const sendStream = useCallback(
    (
      convId: string,
      content: string,
      images: string[] | undefined,
      model: string | undefined,
      onNewConv?: (msg: Message) => void,
      fileContext?: string,
    ) => {
      abortRef.current?.abort();
      setStreaming(true);
      setStreamingText("");
      setToolStatus("");
      setStreamError("");
      let accum = "";

      abortRef.current = api.streamMessage(
        convId,
        content,
        images,
        model,
        (chunk) => {
          accum += chunk;
          setStreamingText(accum);
          setToolStatus("");   // 收到文字就清掉「搜尋中」提示
        },
        (userMsg) => {
          setMessages((prev) => [...prev, userMsg]);
          onNewConv?.(userMsg);
        },
        (assistantMsg) => {
          setMessages((prev) => [...prev, assistantMsg]);
          setStreamingText("");
          setToolStatus("");
          setStreaming(false);
        },
        () => setStreaming(false),
        (err) => {
          // FC-2: 不只 console.error，要設定 error state 讓 UI 顯示
          console.error("stream error:", err);
          setStreamError("訊息傳送失敗，請重試");
          setStreaming(false);
          setToolStatus("");
          setStreamingText("");
        },
        (tools) => {
          // 收到 tool_use 事件，顯示「正在搜尋...」
          setToolStatus(`🔍 正在搜尋：${tools.join("、")}`);
          setStreamingText("");   // 清掉之前的文字（搜尋前沒有文字）
          accum = "";
        },
        fileContext,
      );
    },
    []
  );

  const regenerate = useCallback(
    (
      convId: string,
      messageId: string,
      model: string,
      currentMessages: Message[],
    ) => {
      abortRef.current?.abort();
      setStreaming(true);
      setStreamingText("");
      setToolStatus("");
      setStreamError("");
      let accum = "";

      abortRef.current = api.streamRegenerate(
        convId,
        messageId,
        model,
        (chunk) => {
          accum += chunk;
          setStreamingText(accum);
        },
        (userMsg) => {
          // 用新的 user message 取代舊的（後端重新存了新 ID）
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === messageId);
            // 找到 messageId 之前的那則 user message，替換之
            const userIdx = idx > 0
              ? prev.slice(0, idx).map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === "user")?.i
              : undefined;
            if (userIdx !== undefined) {
              const next = [...prev.slice(0, userIdx), userMsg];
              return next;
            }
            return prev;
          });
        },
        (assistantMsg) => {
          setMessages((prev) => [...prev, assistantMsg]);
          setStreamingText("");
          setStreaming(false);
        },
        () => setStreaming(false),
        (err) => {
          console.error("regenerate error:", err);
          setStreamError("重新生成失敗，請稍後再試");
          setStreaming(false);
          setStreamingText("");
          // 還原原本的訊息列表
          setMessages(currentMessages);
        },
      );
    },
    []
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setStreamingText("");
    setToolStatus("");
  }, []);

  return { messages, streamingText, toolStatus, streaming, streamError, setHistory, sendStream, regenerate, abort };
}
