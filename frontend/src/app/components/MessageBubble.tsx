import { useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, RefreshCw } from "lucide-react";
import type { Message } from "../types";

interface Props {
  message: Message;
  onRegenerate?: (messageId: string) => void;
}

/** 程式碼區塊：複製按鈕 + 語言標籤 */
function CodeBlock({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const code = String(children ?? "").replace(/\n$/, "");
  const lang = className?.replace("language-", "") ?? "";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="relative group my-3">
      {/* 頂列：語言標籤 + 複製按鈕 */}
      <div
        className="flex items-center justify-between px-3 py-1.5 rounded-t-md"
        style={{ backgroundColor: "#0d0f1a", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <span className="text-[11px] font-mono" style={{ color: "#9499a5" }}>
          {lang || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[11px] transition-colors"
          style={{ color: copied ? "#4ade80" : "#9499a5" }}
          title="複製程式碼"
        >
          {copied ? (
            <><Check size={12} /> 已複製</>
          ) : (
            <><Copy size={12} /> 複製</>
          )}
        </button>
      </div>
      {/* 程式碼本體 */}
      <pre
        className="overflow-x-auto px-4 py-3 rounded-b-md text-[13px]"
        style={{ backgroundColor: "#0d0f1a", margin: 0 }}
      >
        <code className={className}>{code}</code>
      </pre>
    </div>
  );
}

export function MessageBubble({ message, onRegenerate }: Props) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-5">
        <div
          className="max-w-[70%] rounded-2xl rounded-br-sm px-4 py-3 text-[14px] leading-relaxed text-white"
          style={{ backgroundColor: "#5e6ad2", borderRadius: "12px 4px 12px 12px", boxShadow: "0 1px 4px rgba(94,106,210,0.3), 0 2px 12px rgba(94,106,210,0.15)" }}
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
    <div className="flex justify-start mb-5 gap-3 group/msg">
      {/* Avatar dot */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: "#1a1d2e", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <span className="text-[12px] select-none" style={{ color: "#5e6ad2" }}>✦</span>
      </div>

      {/* Content area */}
      <div className="max-w-[80%] w-full">
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "#62666d" }}>Yang</p>
        <div
          className="rounded-xl px-4 py-3 prose prose-invert prose-sm max-w-none"
          style={{
            backgroundColor: "#131520",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: "4px 12px 12px 12px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          }}
        >
          {/* 產圖結果（assistant images） */}
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-3">
              {message.images.map((img, i) => (
                <img
                  key={i}
                  src={img}
                  alt={`產圖 ${i + 1}`}
                  className="max-w-full rounded-lg object-contain"
                  style={{ maxHeight: "480px", border: "1px solid rgba(255,255,255,0.1)" }}
                />
              ))}
            </div>
          )}
          {message.content && (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const isBlock = className?.startsWith("language-");
                  if (isBlock) {
                    return <CodeBlock className={className}>{children}</CodeBlock>;
                  }
                  return (
                    <code
                      className={className}
                      style={{
                        backgroundColor: "rgba(255,255,255,0.08)",
                        padding: "0.1em 0.35em",
                        borderRadius: "4px",
                        fontSize: "0.88em",
                      }}
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>

        {/* 重新生成按鈕（hover 才顯示，只在 assistant 訊息） */}
        {onRegenerate && (
          <button
            onClick={() => onRegenerate(message.id)}
            className="mt-1.5 flex items-center gap-1 text-[11px] opacity-0 group-hover/msg:opacity-100 transition-opacity"
            style={{ color: "#62666d" }}
            title="重新生成"
          >
            <RefreshCw size={11} />
            重新生成
          </button>
        )}
      </div>
    </div>
  );
}
