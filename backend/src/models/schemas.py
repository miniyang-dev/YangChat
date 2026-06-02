from pydantic import BaseModel
from typing import Optional, List


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
    updated_at: str


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    role: str
    content: str
    images: Optional[List[str]] = None
    created_at: str


class ConversationDetail(ConversationSummary):
    messages: List[MessageOut]
    created_at: str


# --- Messages ---
class SendMessageRequest(BaseModel):
    conversation_id: str
    content: str
    images: Optional[List[str]] = None  # base64 data URLs
    model: Optional[str] = None         # override 模型


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
