import { useRef, useState, type KeyboardEvent } from "react";
import { Paperclip, Send, X } from "lucide-react";
import type { ModelInfo } from "../types";

interface Props {
  models: ModelInfo[];
  selectedModel: string;
  disabled: boolean;
  onSend: (content: string, images: string[]) => void;
}

export function InputBar({ models, selectedModel, disabled, onSend }: Props) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedModelInfo = models.find((m) => m.id === selectedModel);
  const visionEnabled = selectedModelInfo?.vision ?? false;

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0) return;
    onSend(trimmed, images);
    setText("");
    setImages([]);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled) handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setImages((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="border-t border-gray-700 p-4">
      {/* 圖片預覽 */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {images.map((img, i) => (
            <div key={i} className="relative">
              <img
                src={img}
                alt={`預覽 ${i + 1}`}
                className="h-16 w-16 object-cover rounded-lg border border-gray-600"
              />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1 -right-1 bg-gray-900 rounded-full p-0.5 hover:bg-red-600 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* 圖片上傳按鈕 */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={!visionEnabled || disabled}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title={!visionEnabled ? "當前模型不支援圖片" : "上傳圖片"}
        >
          <Paperclip size={20} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* 文字輸入 */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          disabled={disabled}
          placeholder="輸入訊息... (Enter 送出，Shift+Enter 換行)"
          rows={1}
          className="flex-1 bg-gray-700 text-gray-100 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-500 disabled:opacity-50 max-h-40 overflow-y-auto"
          style={{ lineHeight: "1.5" }}
        />

        {/* 送出 */}
        <button
          onClick={handleSend}
          disabled={disabled || (!text.trim() && images.length === 0)}
          className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  );
}
