import { useRef, useState, type KeyboardEvent } from "react";
import { Paperclip, FileText, Send, X } from "lucide-react";
import type { ModelInfo } from "../types";
import { uploadFile, type UploadResult } from "../services/api";

interface Props {
  models: ModelInfo[];
  selectedModel: string;
  disabled: boolean;
  onSend: (content: string, images: string[], fileContext?: string) => void;
}

// 圖片限制
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_IMAGE_COUNT = 4;
const BLOCKED_MIME = ["image/svg+xml"];

// 文件上傳限制
const ACCEPTED_DOC_TYPES = ".pdf,.pptx,.docx,.txt,.md,.csv";

export function InputBar({ models, selectedModel, disabled, onSend }: Props) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imgError, setImgError] = useState<string>("");

  // 文件上傳狀態
  const [uploadedFile, setUploadedFile] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string>("");

  const imgFileRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedModelInfo = models.find((m) => m.id === selectedModel);
  const visionEnabled = selectedModelInfo?.vision ?? false;

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && images.length === 0 && !uploadedFile) return;
    onSend(trimmed, images, uploadedFile?.full_text);
    setText("");
    setImages([]);
    setImgError("");
    setUploadedFile(null);
    setFileError("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled) handleSend();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  // ── 圖片上傳 ───────────────────────────────────────────────────────────────
  const handleImgFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImgError("");
    const files = Array.from(e.target.files || []);

    if (images.length + files.length > MAX_IMAGE_COUNT) {
      setImgError(`最多只能上傳 ${MAX_IMAGE_COUNT} 張圖片`);
      e.target.value = "";
      return;
    }

    files.forEach((file) => {
      if (!file.type.startsWith("image/")) {
        setImgError("只能上傳圖片格式");
        return;
      }
      if (BLOCKED_MIME.includes(file.type)) {
        setImgError("不支援 SVG 格式（安全限制）");
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        setImgError(`圖片「${file.name}」超過 5MB 限制`);
        return;
      }
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
    setImgError("");
  };

  // ── 文件上傳 ───────────────────────────────────────────────────────────────
  const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError("");
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    setUploadedFile(null);
    try {
      const result = await uploadFile(file);
      setUploadedFile(result);
    } catch (err: unknown) {
      setFileError((err as Error).message || "上傳失敗，請重試");
    } finally {
      setUploading(false);
    }
  };

  const removeFile = () => {
    setUploadedFile(null);
    setFileError("");
  };

  const sendDisabled =
    disabled ||
    uploading ||
    (!text.trim() && images.length === 0 && !uploadedFile);

  return (
    <div
      className="px-6 py-4"
      style={{
        borderTop: "1px solid rgba(255,255,255,0.07)",
        backgroundColor: "#08090a",
      }}
    >
      <div className="max-w-3xl mx-auto">
        {/* 錯誤提示 */}
        {imgError && <p className="text-red-400 text-xs mb-2">{imgError}</p>}
        {fileError && <p className="text-red-400 text-xs mb-2">{fileError}</p>}

        {/* 圖片預覽 */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {images.map((img, i) => (
              <div key={i} className="relative">
                <img
                  src={img}
                  alt={`預覽 ${i + 1}`}
                  className="h-16 w-16 object-cover rounded-lg"
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1 -right-1 rounded-full p-0.5 transition-colors"
                  style={{ backgroundColor: "#08090a", border: "1px solid rgba(255,255,255,0.1)" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#991b1b")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#08090a")
                  }
                >
                  <X size={12} style={{ color: "#9499a5" }} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 已上傳文件標籤 */}
        {uploadedFile && (
          <div
            className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg"
            style={{ backgroundColor: "#111219", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <FileText size={14} style={{ color: "#5e6ad2", flexShrink: 0 }} />
            <span className="text-xs flex-1 truncate" style={{ color: "#9499a5" }}>
              {uploadedFile.filename}
            </span>
            <span className="text-xs" style={{ color: "#62666d" }}>
              {uploadedFile.char_count.toLocaleString()} 字元
            </span>
            <button onClick={removeFile}>
              <X size={12} style={{ color: "#9499a5" }} />
            </button>
          </div>
        )}

        {/* 上傳中提示 */}
        {uploading && (
          <p className="text-xs mb-2" style={{ color: "#5e6ad2" }}>
            正在解析文件...
          </p>
        )}

        {/* Unified input box */}
        <form
          data-testid="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!disabled) handleSend();
          }}
        >
          <div
            className="flex items-end gap-3 rounded-xl px-4 py-3 transition-all duration-150"
            style={{
              backgroundColor: "#111219",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
            onFocusCapture={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor =
                "rgba(255,255,255,0.15)";
            }}
            onBlurCapture={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor =
                "rgba(255,255,255,0.08)";
            }}
          >
            {/* 圖片上傳按鈕（需要 vision 模型） */}
            <button
              type="button"
              onClick={() => imgFileRef.current?.click()}
              disabled={!visionEnabled || disabled}
              className="p-2 rounded-lg transition-all duration-150 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: "#62666d" }}
              onMouseEnter={(e) => {
                if (visionEnabled && !disabled) {
                  (e.currentTarget as HTMLButtonElement).style.color = "#9499a5";
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    "rgba(255,255,255,0.05)";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#62666d";
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
              }}
              title={!visionEnabled ? "當前模型不支援圖片" : "上傳圖片"}
            >
              <Paperclip size={18} />
            </button>
            <input
              ref={imgFileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={handleImgFileChange}
            />

            {/* 文件上傳按鈕（PDF/DOCX/等） */}
            <button
              type="button"
              onClick={() => docFileRef.current?.click()}
              disabled={disabled || uploading}
              className="p-2 rounded-lg transition-all duration-150 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: uploadedFile ? "#5e6ad2" : "#62666d" }}
              onMouseEnter={(e) => {
                if (!disabled && !uploading) {
                  (e.currentTarget as HTMLButtonElement).style.color = "#9499a5";
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    "rgba(255,255,255,0.05)";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = uploadedFile ? "#5e6ad2" : "#62666d";
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
              }}
              title="上傳文件（PDF、Word、PPTX、TXT、Markdown、CSV）"
            >
              <FileText size={18} />
            </button>
            <input
              ref={docFileRef}
              type="file"
              accept={ACCEPTED_DOC_TYPES}
              className="hidden"
              onChange={handleDocFileChange}
            />

            {/* 文字輸入 */}
            <textarea
              ref={textareaRef}
              data-testid="message-input"
              value={text}
              onChange={handleTextChange}
              onInput={handleTextChange as unknown as React.FormEventHandler<HTMLTextAreaElement>}
              onKeyDown={handleKey}
              disabled={disabled}
              placeholder={uploadedFile ? `已附加「${uploadedFile.filename}」，輸入問題或指令...` : "發送訊息..."}
              rows={1}
              className="flex-1 bg-transparent text-[14px] resize-none outline-none leading-relaxed disabled:opacity-50 overflow-y-auto"
              style={{
                color: "#f0f1f3",
                lineHeight: "1.6",
                maxHeight: "160px",
              }}
            />

            {/* 送出 */}
            <button
              type="submit"
              data-testid="send-button"
              disabled={sendDisabled}
              className="p-2 rounded-lg text-white transition-all duration-150 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#5e6ad2" }}
              onMouseEnter={(e) => {
                if (!sendDisabled) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#6e7ae0";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#5e6ad2";
              }}
            >
              <Send size={18} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
