from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional, List

MAX_IMAGE_B64_CHARS = 5 * 1024 * 1024  # 5 MB base64 字元數
MAX_IMAGES = 4


# --- Auth ---
class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    success: bool
    token: Optional[str] = None
    message: str = ""


# --- Conversations ---
class ConversationCreate(BaseModel):
    model: str
    first_message: str  # 用來產生標題（取前 40 字）


class ConversationSummary(BaseModel):
    id: str
    title: str
    model: str
    system_prompt: str = ""
    updated_at: str

class MessageOut(BaseModel):
    id: str
    conversation_id: str
    role: Literal["user", "assistant", "system"]  # S4: 收窄型別
    content: str
    images: Optional[List[str]] = None
    created_at: str


class ConversationDetail(ConversationSummary):
    messages: List[MessageOut]
    created_at: str


# --- Messages ---
class SendMessageRequest(BaseModel):
    conversation_id: str
    content: str = Field(default="", max_length=32_000)  # W3: 長度上限
    images: Optional[List[str]] = None  # base64 data URLs
    model: Optional[str] = None         # override 模型
    file_context: Optional[str] = Field(default=None, max_length=20_000)  # 解析後的文件文字

    # W1: 圖片大小與數量驗證
    @field_validator("images")
    @classmethod
    def validate_images(cls, images: Optional[List[str]]) -> Optional[List[str]]:
        if images is None:
            return images
        if len(images) > MAX_IMAGES:
            raise ValueError(f"最多只能上傳 {MAX_IMAGES} 張圖片")
        for img in images:
            if not img.startswith("data:image/"):
                raise ValueError("圖片格式錯誤，必須為 data URL（data:image/...）")
            # 黑名單：SVG 可內嵌 script
            if img.startswith("data:image/svg"):
                raise ValueError("不支援 SVG 格式（安全限制）")
            if len(img) > MAX_IMAGE_B64_CHARS:
                raise ValueError(f"單張圖片 base64 大小不可超過 5MB")
        return images


class SendMessageResponse(BaseModel):
    success: bool
    user_message: Optional[MessageOut] = None
    assistant_message: Optional[MessageOut] = None
    error: str = ""


# --- Models ---
class ModelInfo(BaseModel):
    id: str
    name: str
    vision: bool = False


class ModelsResponse(BaseModel):
    success: bool
    data: List[ModelInfo]
