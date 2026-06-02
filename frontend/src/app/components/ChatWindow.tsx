import { useEffect, useRef } from "react";
import type { Message } from "../types";
import { MessageBubble } from "./MessageBubble";
import { StreamingBubble } from "./StreamingBubble";

interface Props {
  messages: Message[];
  streamingText: string;
  isStreaming: boolean;
}

export function ChatWindow({ messages, streamingText, isStreaming }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-3">💬</div>
          <p className="text-lg font-medium text-gray-400">YangChat</p>
          <p className="text-sm mt-1">傳送訊息開始對話</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isStreaming && <StreamingBubble text={streamingText} />}
      <div ref={bottomRef} />
    </div>
  );
}
