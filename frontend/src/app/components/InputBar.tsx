import { useRef, useState, type KeyboardEvent } from "react";
import { Paperclip, FileText, Send, X, ImageIcon } from "lucide-react";
import { uploadFile, uploadImage, type UploadResult, type ImageUploadResult } from "../services/api";

interface Props {
  disabled: boolean;
  onSend: (content: string, images: string[], fileContext?: string) => void;
}

// 合併 accept：圖片 + 文件
const ACCEPTED_ALL = "image/jpeg,image/png,image/gif,image/webp,.pdf,.pptx,.docx,.txt,.md,.csv";

const ALLOWED_IMG_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const ALLOWED_DOC_EXT = [".pdf", ".pptx", ".docx", ".txt", ".md", ".csv"];

export function InputBar({ disabled, onSend }: Props) {
  const [text, setText] = useState("");

  // 文件上傳狀態（PDF/PPTX/DOCX/TXT/MD/CSV）
  const [uploadedFile, setUploadedFile] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string>("");

  // 圖片上傳狀態（→ Gemini 描述 → file_context）
  const [uploadedImage, setUploadedImage] = useState<ImageUploadResult | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string>("");

  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 合併 file_context（文件優先；圖片描述次之）
  const fileContext = [
    uploadedFile?.full_text,
    uploadedImage?.full_text,
  ].filter(Boolean).join("\n\n") || undefined;

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && !uploadedFile && !uploadedImage) return;
    onSend(trimmed, [], fileContext);
    setText("");
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

  // ── 統一上傳入口：依 MIME type / 副檔名自動分流 ──────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError("");
    setImageError("");
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const isImage = ALLOWED_IMG_TYPES.includes(file.type);
    const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
    const isDoc = ALLOWED_DOC_EXT.includes(ext);

    if (isImage) {
      // ── 圖片路徑 ──────────────────────────────────────────────────────────
      const MAX_IMG_SIZE = 5 * 1024 * 1024; // 5MB
      if (file.size > MAX_IMG_SIZE) {
        setImageError("圖片大小不可超過 5MB");
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
    } else if (isDoc) {
      // ── 文件路徑 ──────────────────────────────────────────────────────────
      const MAX_DOC_SIZE = 10 * 1024 * 1024; // 10MB
      if (file.size > MAX_DOC_SIZE) {
        setFileError("檔案大小不可超過 10MB");
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
    } else {
      setFileError("不支援的格式，請上傳圖片（JPEG/PNG/GIF/WebP）或文件（PDF/Word/PPTX/TXT/MD/CSV）");
    }
  };

  const removeFile = () => { setUploadedFile(null); setFileError(""); };
  const removeImage = () => { setUploadedImage(null); setImageError(""); };

  const isUploading = uploading || uploadingImage;

  const sendDisabled =
    disabled ||
    isUploading ||
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
            {/* 單一附件按鈕：自動判斷圖片 or 文件 */}
            <label
              htmlFor="file-upload"
              className="p-2 rounded-lg transition-all duration-150 flex-shrink-0 cursor-pointer"
              style={{
                color: (uploadedImage || uploadedFile) ? "#5e6ad2" : "#62666d",
                opacity: (disabled || isUploading) ? 0.3 : 1,
                pointerEvents: (disabled || isUploading) ? "none" : "auto",
              }}
              onMouseEnter={(e) => {
                if (!disabled && !isUploading) {
                  (e.currentTarget as HTMLLabelElement).style.color = "#9499a5";
                  (e.currentTarget as HTMLLabelElement).style.backgroundColor = "rgba(255,255,255,0.05)";
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLLabelElement).style.color =
                  (uploadedImage || uploadedFile) ? "#5e6ad2" : "#62666d";
                (e.currentTarget as HTMLLabelElement).style.backgroundColor = "transparent";
              }}
              title="上傳圖片或文件（自動判斷）"
            >
              <Paperclip size={18} />
            </label>
            <input
              id="file-upload"
              ref={fileRef}
              type="file"
              accept={ACCEPTED_ALL}
              className="hidden"
              onChange={handleFileChange}
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
