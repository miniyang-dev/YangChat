import { useState, useRef, useCallback } from "react";
import type { Message } from "../types";
import * as api from "../services/api";

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [toolStatus, setToolStatus] = useState<string>("");   // 「🔍 搜尋中...」
  const abortRef = useRef<AbortController | null>(null);

  const setHistory = useCallback((msgs: Message[]) => {
    setMessages(msgs);
    setStreamingText("");
    setToolStatus("");
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
          console.error("stream error:", err);
          setStreaming(false);
          setToolStatus("");
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

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setStreamingText("");
    setToolStatus("");
  }, []);

  return { messages, streamingText, toolStatus, streaming, setHistory, sendStream, abort };
}
