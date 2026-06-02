import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "../types";

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-5">
        <div
          className="max-w-[70%] rounded-2xl rounded-br-sm px-4 py-3 text-[14px] leading-relaxed text-white"
          style={{ backgroundColor: "#3b4fd4" }}
        >
          {/* 圖片縮圖（user 附圖） */}
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {message.images.map((img, i) => (
                <img
                  key={i}
                  src={img}
                  alt={`附圖 ${i + 1}`}
                  className="max-h-40 max-w-xs rounded-lg object-contain"
                  style={{ border: "1px solid rgba(255,255,255,0.2)" }}
                />
              ))}
            </div>
          )}
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  // AI message
  return (
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

      {/* Content area */}
      <div className="max-w-[80%]">
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "#62666d" }}>
          Yang
        </p>
        <div
          className="rounded-xl px-4 py-3 prose prose-invert prose-sm max-w-none"
          style={{
            backgroundColor: "#131520",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
