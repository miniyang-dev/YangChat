import { useState, useRef, useCallback } from "react";
import type { Message } from "../types";
import * as api from "../services/api";

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const setHistory = useCallback((msgs: Message[]) => {
    setMessages(msgs);
    setStreamingText("");
  }, []);

  const sendStream = useCallback(
    (
      convId: string,
      content: string,
      images: string[] | undefined,
      model: string | undefined,
      onNewConv?: (msg: Message) => void
    ) => {
      setStreaming(true);
      setStreamingText("");
      let accum = "";

      abortRef.current = api.streamMessage(
        convId,
        content,
        images,
        model,
        (chunk) => {
          accum += chunk;
          setStreamingText(accum);
        },
        (userMsg) => {
          setMessages((prev) => [...prev, userMsg]);
          onNewConv?.(userMsg);
        },
        (assistantMsg) => {
          setMessages((prev) => [...prev, assistantMsg]);
          setStreamingText("");
          setStreaming(false);
        },
        () => setStreaming(false),
        (err) => {
          console.error("stream error:", err);
          setStreaming(false);
        }
      );
    },
    []
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  return { messages, streamingText, streaming, setHistory, sendStream, abort };
}
