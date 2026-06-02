import { useEffect, useRef } from "react";
import type { Message } from "../types";
import { MessageBubble } from "./MessageBubble";
import { StreamingBubble } from "./StreamingBubble";

interface Props {
  messages: Message[];
  streamingText: string;
  toolStatus: string;
  isStreaming: boolean;
}

export function ChatWindow({ messages, streamingText, toolStatus, isStreaming }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, streamingText, toolStatus]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-[#5e6ad2] text-2xl mb-3 select-none">✦</div>
          <p
            className="font-medium mb-1"
            style={{ fontSize: "18px", color: "#f0f1f3" }}
          >
            YangChat
          </p>
          <p className="text-[14px]" style={{ color: "#62666d" }}>
            問我任何事
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6">
      <div className="max-w-3xl mx-auto w-full">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {/* 工具使用中提示（搜尋中...）*/}
        {isStreaming && toolStatus && (
          <div className="flex justify-start mb-5 gap-3">
            {/* Avatar dot */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{
                backgroundColor: "#1a1d2e",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <span className="text-[12px] select-none" style={{ color: "#5e6ad2" }}>
                ✦
              </span>
            </div>
            <div className="mt-0.5">
              <p
                className="text-[13px] italic animate-pulse"
                style={{ color: "#9499a5" }}
              >
                {toolStatus}
              </p>
            </div>
          </div>
        )}

        {/* AI 回覆串流中 */}
        {isStreaming && streamingText && <StreamingBubble text={streamingText} />}

        {/* 只有 streaming 尚未有文字時也顯示 loading dots */}
        {isStreaming && !streamingText && !toolStatus && (
          <StreamingBubble text="" />
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
