import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  text: string;
}

export function StreamingBubble({ text }: Props) {
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
        {text ? (
          <div
            className="rounded-xl px-4 py-3 prose prose-invert prose-sm max-w-none"
            style={{
              backgroundColor: "#131520",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        ) : (
          <div
            className="rounded-xl px-4 py-3 flex gap-1.5 items-center"
            style={{
              backgroundColor: "#131520",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: "#5e6ad2", animationDelay: "0ms" }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: "#5e6ad2", animationDelay: "200ms" }}
            />
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: "#5e6ad2", animationDelay: "400ms" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
