# YangChat 初始實作計畫

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 打造一個自架 AI Chat UI，串接 Pioneer AI（OpenAI-compatible），支援多模態（文字＋圖片），具備對話記錄與模型選擇功能。

**Architecture:**
- 後端：FastAPI + SQLite（對話/訊息持久化）+ Pioneer AI SDK（openai-compatible）
- 前端：React + TypeScript + Vite，Tailwind CSS 暗色主題（對齊 ShioajiTrader 風格）
- 圖片：前端 base64 encode → 直接塞入 OpenAI message content，不存 server 端
- 部署：Docker Compose（backend + nginx 靜態服務前端）

**Tech Stack:**
- Backend: FastAPI, SQLite (aiosqlite), openai-python SDK, pydantic, python-jose, bcrypt
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, react-markdown, react-router-dom
- Container: Docker Compose

---

## 專案清單

```
YangChat/
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── auth.py          # 登入/登出
│   │   │   ├── conversations.py # 對話 CRUD
│   │   │   ├── messages.py      # 訊息 send/stream
│   │   │   └── models.py        # 取得可用模型列表
│   │   ├── models/
│   │   │   └── schemas.py       # Pydantic schemas
│   │   ├── services/
│   │   │   ├── ai_service.py    # Pioneer AI 串接
│   │   │   └── db_service.py    # SQLite CRUD
│   │   ├── config.py
│   │   ├── database.py          # DB init / connection
│   │   ├── middleware.py
│   │   └── main.py
│   ├── tests/
│   │   ├── conftest.py
│   │   └── test_api.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   └── app/
│   │       ├── components/
│   │       │   ├── Layout.tsx
│   │       │   ├── Sidebar.tsx        # 對話列表
│   │       │   ├── ChatWindow.tsx     # 主聊天區
│   │       │   ├── MessageBubble.tsx  # 單則訊息（含圖片）
│   │       │   ├── InputBar.tsx       # 輸入框 + 圖片上傳
│   │       │   ├── ModelSelector.tsx  # 模型下拉選單
│   │       │   └── ProtectedRoute.tsx
│   │       ├── pages/
│   │       │   ├── Login.tsx
│   │       │   └── Chat.tsx
│   │       ├── services/
│   │       │   └── api.ts
│   │       ├── hooks/
│   │       │   ├── useChat.ts         # 訊息狀態管理
│   │       │   └── useConversations.ts
│   │       └── types/
│   │           └── index.ts
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Phase 1：後端基礎建設

### Task 1：專案初始化 + 設定檔

**Objective:** 建立 requirements.txt、config.py、.env.example

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/src/config.py`
- Create: `.env.example`

**requirements.txt:**
```
fastapi==0.111.0
uvicorn[standard]==0.29.0
openai==1.30.0
aiosqlite==0.20.0
python-jose[cryptography]==3.3.0
bcrypt==4.1.3
python-multipart==0.0.9
pydantic==2.7.1
pydantic-settings==2.2.1
httpx==0.27.0
pytest==8.2.0
pytest-asyncio==0.23.7
```

**config.py:**
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Pioneer AI
    PIONEER_API_KEY: str
    PIONEER_BASE_URL: str = "https://api.pioneer.ai/v1"
    DEFAULT_MODEL: str = "claude-sonnet-4-6"

    # Auth
    JWT_SECRET: str
    JWT_EXPIRATION_HOURS: int = 24

    # DB
    DB_PATH: str = "/data/yangchat.db"

    # App
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:80"]

    class Config:
        env_file = ".env"

settings = Settings()
```

**.env.example:**
```
PIONEER_API_KEY=pio_sk_xxx
PIONEER_BASE_URL=https://api.pioneer.ai/v1
DEFAULT_MODEL=claude-sonnet-4-6
JWT_SECRET=change-me-in-production
DB_PATH=/data/yangchat.db
```

---

### Task 2：Database 初始化（SQLite）

**Objective:** 定義 DB schema，建立 conversations / messages 兩張表

**Files:**
- Create: `backend/src/database.py`

**Schema 設計：**
```sql
-- 對話串
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,           -- UUID
    title TEXT NOT NULL,           -- 對話標題（取第一則訊息前 30 字）
    model TEXT NOT NULL,           -- 使用的模型
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 訊息（一對多）
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,            -- "user" | "assistant"
    content TEXT NOT NULL,         -- 文字內容
    images TEXT,                   -- JSON array of base64 strings（可 NULL）
    created_at TEXT NOT NULL
);
```

**database.py:**
```python
import aiosqlite
from pathlib import Path
from src.config import settings

async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(settings.DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db

async def init_db():
    Path(settings.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(settings.DB_PATH) as db:
        await db.execute("PRAGMA foreign_keys=ON")
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                model TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL
                    REFERENCES conversations(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                images TEXT,
                created_at TEXT NOT NULL
            );
        """)
        await db.commit()
```

---

### Task 3：Pydantic Schemas

**Objective:** 定義所有 request/response schema

**Files:**
- Create: `backend/src/models/schemas.py`

**schemas.py（核心）：**
```python
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

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
    first_message: str   # 用來產生標題

class ConversationSummary(BaseModel):
    id: str
    title: str
    model: str
    updated_at: str

class ConversationDetail(ConversationSummary):
    messages: list["MessageOut"]
    created_at: str

# --- Messages ---
class MessageCreate(BaseModel):
    role: str
    content: str
    images: Optional[list[str]] = None  # base64 strings

class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    images: Optional[list[str]] = None
    created_at: str

# --- AI Send ---
class SendMessageRequest(BaseModel):
    conversation_id: str
    content: str
    images: Optional[list[str]] = None  # base64 data URLs
    model: Optional[str] = None         # override model

class SendMessageResponse(BaseModel):
    success: bool
    message: Optional[MessageOut] = None
    error: str = ""

# --- Models ---
class ModelInfo(BaseModel):
    id: str
    name: str
    vision: bool = False   # 支援圖片
```

---

### Task 4：AI Service（Pioneer AI 串接）

**Objective:** 封裝 Pioneer AI 呼叫，支援文字 + 圖片，支援 streaming

**Files:**
- Create: `backend/src/services/ai_service.py`

**ai_service.py:**
```python
import json
from openai import AsyncOpenAI
from src.config import settings
from typing import AsyncGenerator

# 可用模型清單（Pioneer AI 支援的）
AVAILABLE_MODELS = [
    {"id": "claude-sonnet-4-6", "name": "Claude Sonnet 4.6", "vision": True},
    {"id": "claude-opus-4-5",   "name": "Claude Opus 4.5",   "vision": True},
    {"id": "gpt-4o",            "name": "GPT-4o",             "vision": True},
    {"id": "gpt-4o-mini",       "name": "GPT-4o Mini",        "vision": True},
    {"id": "gemini-2.0-flash",  "name": "Gemini 2.0 Flash",   "vision": True},
]

def get_client() -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=settings.PIONEER_API_KEY,
        base_url=settings.PIONEER_BASE_URL,
    )

def build_content(text: str, images: list[str] | None) -> list | str:
    """組建 OpenAI message content（純文字 or 多模態）"""
    if not images:
        return text
    parts = []
    for img in images:
        # 前端傳來 data:image/jpeg;base64,xxx
        parts.append({"type": "image_url", "image_url": {"url": img}})
    parts.append({"type": "text", "text": text})
    return parts

async def chat_stream(
    messages: list[dict],
    model: str,
) -> AsyncGenerator[str, None]:
    """SSE streaming，yield JSON chunks"""
    client = get_client()
    stream = await client.chat.completions.create(
        model=model,
        messages=messages,
        stream=True,
        max_tokens=4096,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta.content or ""
        if delta:
            yield f"data: {json.dumps({'content': delta})}\n\n"
    yield "data: [DONE]\n\n"
```

---

### Task 5：DB Service（CRUD）

**Objective:** 封裝 conversations / messages 的 CRUD 操作

**Files:**
- Create: `backend/src/services/db_service.py`

**db_service.py（核心方法）：**
```python
import uuid, json
from datetime import datetime, timezone
from aiosqlite import Connection

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

async def list_conversations(db: Connection) -> list[dict]:
    async with db.execute(
        "SELECT id, title, model, updated_at FROM conversations ORDER BY updated_at DESC"
    ) as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]

async def create_conversation(db: Connection, model: str, title: str) -> dict:
    conv_id = str(uuid.uuid4())
    now = now_iso()
    await db.execute(
        "INSERT INTO conversations VALUES (?,?,?,?,?)",
        (conv_id, title[:50], model, now, now)
    )
    await db.commit()
    return {"id": conv_id, "title": title[:50], "model": model,
            "created_at": now, "updated_at": now}

async def get_conversation(db: Connection, conv_id: str) -> dict | None:
    async with db.execute(
        "SELECT * FROM conversations WHERE id=?", (conv_id,)
    ) as cur:
        row = await cur.fetchone()
    if not row:
        return None
    conv = dict(row)
    conv["messages"] = await list_messages(db, conv_id)
    return conv

async def delete_conversation(db: Connection, conv_id: str):
    await db.execute("DELETE FROM conversations WHERE id=?", (conv_id,))
    await db.commit()

async def list_messages(db: Connection, conv_id: str) -> list[dict]:
    async with db.execute(
        "SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at",
        (conv_id,)
    ) as cur:
        rows = await cur.fetchall()
    result = []
    for r in rows:
        msg = dict(r)
        msg["images"] = json.loads(msg["images"]) if msg.get("images") else None
        result.append(msg)
    return result

async def save_message(
    db: Connection, conv_id: str, role: str, content: str,
    images: list[str] | None = None
) -> dict:
    msg_id = str(uuid.uuid4())
    now = now_iso()
    images_json = json.dumps(images) if images else None
    await db.execute(
        "INSERT INTO messages VALUES (?,?,?,?,?,?)",
        (msg_id, conv_id, role, content, images_json, now)
    )
    # 更新 conversation updated_at
    await db.execute(
        "UPDATE conversations SET updated_at=? WHERE id=?", (now, conv_id)
    )
    await db.commit()
    return {"id": msg_id, "conversation_id": conv_id, "role": role,
            "content": content, "images": images, "created_at": now}
```

---

### Task 6：API Routes

**Objective:** 實作 auth / conversations / messages / models 四組路由

**Files:**
- Create: `backend/src/api/auth.py`
- Create: `backend/src/api/conversations.py`
- Create: `backend/src/api/messages.py`
- Create: `backend/src/api/models.py`

**auth.py（簡化版，單一使用者，從 env 讀帳密）：**
```python
# 環境變數：CHAT_USERNAME / CHAT_PASSWORD
# JWT 流程跟 ShioajiTrader 一致
```

**conversations.py:**
```
GET    /api/conversations          → list
POST   /api/conversations          → create (body: model + first_message)
GET    /api/conversations/{id}     → detail + messages
DELETE /api/conversations/{id}     → delete
```

**messages.py（核心）:**
```
POST /api/messages/send            → non-streaming（回傳完整 assistant 訊息）
POST /api/messages/stream          → SSE streaming（EventSource）
```

**models.py:**
```
GET /api/models                    → 回傳 AVAILABLE_MODELS 清單
```

---

### Task 7：main.py + Dockerfile（後端）

**Files:**
- Create: `backend/src/main.py`
- Create: `backend/Dockerfile`

**main.py:**
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from src.database import init_db
from src.api import auth, conversations, messages, models
from src.config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title="YangChat API", lifespan=lifespan)

app.add_middleware(CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,          prefix="/api/auth")
app.include_router(conversations.router, prefix="/api/conversations")
app.include_router(messages.router,      prefix="/api/messages")
app.include_router(models.router,        prefix="/api/models")
```

**Dockerfile（後端）:**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ ./src/
EXPOSE 8000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## Phase 2：前端

### Task 8：前端初始化（Vite + React + Tailwind）

**Objective:** 建立前端骨架，設定 Tailwind 暗色主題

```bash
cd /Users/yang/projects/YangChat/frontend
npm create vite@latest . -- --template react-ts
npm install
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
npm install react-router-dom react-markdown remark-gfm @radix-ui/react-scroll-area lucide-react
```

---

### Task 9：型別定義（types/index.ts）

```typescript
export interface Conversation {
  id: string;
  title: string;
  model: string;
  updated_at: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];   // base64 data URLs
  created_at: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  vision: boolean;
}
```

---

### Task 10：API Service（api.ts）

**Objective:** 封裝所有後端 API 呼叫，含 streaming 處理

**核心方法：**
```typescript
// 對話管理
listConversations(): Promise<Conversation[]>
createConversation(model: string, firstMessage: string): Promise<Conversation>
getConversation(id: string): Promise<ConversationDetail>
deleteConversation(id: string): Promise<void>

// 訊息
sendMessage(convId: string, content: string, images?: string[], model?: string)
streamMessage(convId: string, content: string, images?: string[], model?: string,
              onChunk: (text: string) => void, onDone: () => void)

// 模型
listModels(): Promise<ModelInfo[]>
```

---

### Task 11：核心 UI 元件

**Objective:** 實作以下元件（Claude web 風格）

**Sidebar.tsx：**
- 對話列表（點擊切換）
- 「新對話」按鈕
- 刪除對話按鈕（hover 顯示）

**ChatWindow.tsx：**
- 訊息列表（自動捲到底）
- loading 動態（三點跳動）
- 空狀態（歡迎畫面）

**MessageBubble.tsx：**
- user：右對齊，藍色背景
- assistant：左對齊，灰色，Markdown 渲染（react-markdown）
- 圖片縮圖顯示（user 訊息附圖）

**InputBar.tsx：**
- textarea（Enter 送出，Shift+Enter 換行）
- 📎 圖片上傳按鈕（accept="image/*"）
- 選好圖片後顯示縮圖預覽 + 刪除 x
- 送出按鈕（loading 時 disable）

**ModelSelector.tsx：**
- 下拉選單，列出 AVAILABLE_MODELS
- 選了不支援 vision 的模型時，圖片上傳自動 disable

---

### Task 12：頁面（Login.tsx + Chat.tsx）

**Login.tsx：**
- 單純帳密表單
- 登入後 token 存 localStorage
- 跳轉 `/`

**Chat.tsx（主頁）：**
- 左：Sidebar（對話列表）
- 右上：ModelSelector + 對話標題
- 右中：ChatWindow（訊息列表）
- 右下：InputBar
- 首次進入無對話時顯示歡迎畫面

---

### Task 13：前端 Dockerfile + nginx

**frontend/Dockerfile:**
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**nginx.conf（SPA routing + API proxy）:**
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API to backend
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
    }
}
```

---

## Phase 3：整合

### Task 14：docker-compose.yml

```yaml
services:
  backend:
    build: ./backend
    env_file: .env
    volumes:
      - chat_data:/data
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  chat_data:
```

### Task 15：端對端測試清單

- [ ] 登入 / 登出
- [ ] 建立新對話（選模型）
- [ ] 傳文字訊息（streaming 顯示）
- [ ] 傳圖片 + 文字（vision）
- [ ] 切換對話
- [ ] 刪除對話
- [ ] 換模型後自動 disable 圖片上傳（若不支援 vision）

---

## 執行順序建議

```
Phase 1（後端）→ Task 1~7
Phase 2（前端）→ Task 8~13
Phase 3（整合）→ Task 14~15
```

每個 Task 完成後 commit，保持 git 歷史乾淨。
