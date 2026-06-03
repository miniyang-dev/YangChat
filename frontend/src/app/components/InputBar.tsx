import { useRef, useState, type KeyboardEvent } from "react";
import { Paperclip, FileText, Send, X, ImageIcon } from "lucide-react";
import { uploadFile, uploadImage, type UploadResult, type ImageUploadResult } from "../services/api";

interface Props {
  disabled: boolean;
  onSend: (content: string, images: string[], fileContext?: string) => void;
}

// 文件上傳限制
const ACCEPTED_DOC_TYPES = ".pdf,.pptx,.docx,.txt,.md,.csv";
// 圖片上傳（送 Gemini 分析）
const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/gif,image/webp";

export function InputBar({ disabled, onSend }: Props) {
  const [text, setText] = useState("");
  const [imgError, setImgError] = useState<string>("");

  // 文件上傳狀態（PDF/PPTX/DOCX/TXT/MD/CSV）
  const [uploadedFile, setUploadedFile] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string>("");

  // 圖片上傳狀態（→ Gemini 描述 → file_context）
  const [uploadedImage, setUploadedImage] = useState<ImageUploadResult | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string>("");

  const imgFileRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 合併 file_context（文件優先；圖片描述次之；兩者都有時合併）
  const fileContext = [
    uploadedFile?.full_text,
    uploadedImage?.full_text,
  ].filter(Boolean).join("\n\n") || undefined;

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && !uploadedFile && !uploadedImage) return;
    onSend(trimmed, [], fileContext);
    setText("");
    setImgError("");
    setUploadedFile(null);
    setFileError("");
    setUploadedImage(null);
    setImageError("");
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

  // ── 文件上傳（PDF/PPTX/DOCX 等）──────────────────────────────────────────
  const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError("");
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    // FC-3: client-side 大小驗證，不等到 server 才拒絕
    const MAX_DOC_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_DOC_SIZE) {
      setFileError("檔案大小不可超過 10MB");
      return;
    }

    // 副檔名白名單驗證（accept 屬性可被繞過）
    const ALLOWED_DOC_EXT = [".pdf", ".pptx", ".docx", ".txt", ".md", ".csv"];
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
    if (!ALLOWED_DOC_EXT.includes(ext)) {
      setFileError("不支援的檔案格式，請上傳 PDF、Word、PPTX、TXT、Markdown 或 CSV");
      return;
    }

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

  // ── 圖片上傳（→ Gemini Flash 描述）────────────────────────────────────────
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImageError("");
    setImgError(""); // FW-7: imgError 現在用於圖片大小/格式錯誤（原先是 dead code）
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    // FC-3: client-side 大小驗證
    const MAX_IMG_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_IMG_SIZE) {
      setImgError("圖片大小不可超過 5MB");
      return;
    }

    // MIME type 驗證
    const ALLOWED_IMG_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!ALLOWED_IMG_TYPES.includes(file.type)) {
      setImgError("不支援的圖片格式，請上傳 JPEG、PNG、GIF 或 WebP");
      return;
    }

    setUploadingImage(true);
    setUploadedImage(null);
    try {
      const result = await uploadImage(file);
      setUploadedImage(result);
    } catch (err: unknown) {
      setImageError((err as Error).message || "圖片分析失敗，請重試");
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = () => {
    setUploadedImage(null);
    setImageError("");
  };

  const sendDisabled =
    disabled ||
    uploading ||
    uploadingImage ||
    (!text.trim() && !uploadedFile && !uploadedImage);

  // placeholder 動態提示
  const placeholder = uploadedImage
    ? `已分析圖片「${uploadedImage.filename}」，輸入問題...`
    : uploadedFile
    ? `已附加「${uploadedFile.filename}」，輸入問題或指令...`
    : "發送訊息...";

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
        {imageError && <p className="text-red-400 text-xs mb-2">{imageError}</p>}

        {/* 圖片分析預覽標籤 */}
        {uploadedImage && (
          <div
            className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg"
            style={{ backgroundColor: "#111219", border: "1px solid rgba(94,106,210,0.3)" }}
          >
            <ImageIcon size={14} style={{ color: "#5e6ad2", flexShrink: 0 }} />
            <span className="text-xs flex-1 truncate" style={{ color: "#9499a5" }}>
              {uploadedImage.filename}
            </span>
            <span className="text-xs" style={{ color: "#62666d" }}>
              圖片已分析（{uploadedImage.description_length.toLocaleString()} 字）
            </span>
            <button onClick={removeImage}>
              <X size={12} style={{ color: "#9499a5" }} />
            </button>
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
        {uploadingImage && (
          <p className="text-xs mb-2" style={{ color: "#5e6ad2" }}>
            正在分析圖片（Gemini Flash）...
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
            {/* 圖片上傳按鈕（→ Gemini 分析，永遠可用） */}
            <button
              type="button"
              onClick={() => imgFileRef.current?.click()}
              disabled={disabled || uploadingImage}
              className="p-2 rounded-lg transition-all duration-150 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: uploadedImage ? "#5e6ad2" : "#62666d" }}
              onMouseEnter={(e) => {
                if (!disabled && !uploadingImage) {
                  (e.currentTarget as HTMLButtonElement).style.color = "#9499a5";
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    "rgba(255,255,255,0.05)";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = uploadedImage ? "#5e6ad2" : "#62666d";
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
              }}
              title="上傳圖片（Gemini Flash 分析）"
            >
              <Paperclip size={18} />
            </button>
            <input
              ref={imgFileRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              className="hidden"
              onChange={handleImageFileChange}
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
              onKeyDown={handleKey}
              disabled={disabled}
              placeholder={placeholder}
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
