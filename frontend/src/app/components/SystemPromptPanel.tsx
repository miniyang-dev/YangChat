import { useState, useEffect } from "react";
import { X, Save, Sparkles } from "lucide-react";

interface Props {
  convId: string;
  initialPrompt: string;
  onSave: (prompt: string) => void;
  onClose: () => void;
}

const PRESETS = [
  { label: "📝 繁體中文助手", value: "請用繁體中文（台灣用語）回答所有問題，語氣專業但親切。" },
  { label: "💻 資深工程師", value: "你是一位資深軟體工程師。回答請直接切入核心，給出可執行的程式碼範例，避免廢話。" },
  { label: "📊 數據分析師", value: "你是一位專業數據分析師。回答時請提供具體數字、圖表建議及可行的分析方法。" },
  { label: "✍️ 內容創作者", value: "你是一位擅長繁體中文的內容創作者。請幫我寫出吸引人、流暢且有結構的內容。" },
];

export function SystemPromptPanel({ convId, initialPrompt, onSave, onClose }: Props) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrompt(initialPrompt);
  }, [convId, initialPrompt]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(prompt);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const charCount = prompt.length;
  const maxChars = 2000;

  return (
    <div
      className="flex flex-col h-full"
      style={{ borderLeft: "1px solid rgba(255,255,255,0.07)", backgroundColor: "#0e1019" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={14} style={{ color: "#5e6ad2" }} />
          <span className="text-[13px] font-medium" style={{ color: "#e0e1e6" }}>
            System Prompt
          </span>
        </div>
        <button onClick={onClose} style={{ color: "#62666d" }}>
          <X size={15} />
        </button>
      </div>

      {/* Presets */}
      <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <p className="text-[11px] mb-2" style={{ color: "#62666d" }}>快速套用</p>
        <div className="flex flex-col gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setPrompt(p.value)}
              className="text-left text-[12px] px-2.5 py-1.5 rounded-md transition-colors"
              style={{
                color: "#9499a5",
                backgroundColor: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(94,106,210,0.12)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Textarea */}
      <div className="flex-1 px-4 py-3 flex flex-col gap-2 min-h-0">
        <p className="text-[11px]" style={{ color: "#62666d" }}>
          設定後，AI 每次回覆都會遵守此指示
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, maxChars))}
          placeholder="例如：請用繁體中文回答，語氣專業簡潔..."
          className="flex-1 resize-none rounded-lg px-3 py-2.5 text-[13px] leading-relaxed outline-none min-h-0"
          style={{
            backgroundColor: "#131520",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#e0e1e6",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(94,106,210,0.5)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px]" style={{ color: charCount > maxChars * 0.9 ? "#f87171" : "#62666d" }}>
            {charCount} / {maxChars}
          </span>
          {prompt && (
            <button
              onClick={() => setPrompt("")}
              className="text-[11px]"
              style={{ color: "#62666d" }}
            >
              清除
            </button>
          )}
        </div>
      </div>

      {/* Save button */}
      <div className="px-4 pb-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 rounded-lg text-[13px] font-medium flex items-center justify-center gap-1.5 transition-opacity"
          style={{
            backgroundColor: saved ? "#16a34a" : "#5e6ad2",
            color: "#fff",
            opacity: saving ? 0.6 : 1,
          }}
        >
          <Save size={13} />
          {saved ? "已儲存 ✓" : saving ? "儲存中..." : "儲存"}
        </button>
      </div>
    </div>
  );
}
