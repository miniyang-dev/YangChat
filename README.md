# YangChat

個人 AI 聊天應用，透過 [Pioneer AI](https://api.pioneer.ai) 存取多款 LLM，支援網路即時搜尋、串流回覆、對話歷史管理。

---

## 功能特色

- **多模型支援**：Claude Sonnet/Opus/Haiku、Qwen3、MiniMax M3、MiMo 等 12 款模型，一鍵切換
- **AI 主動搜尋**：基於 OpenAI Function Calling，AI 自主判斷何時呼叫 Tavily Search API 取得即時資訊（新聞、天氣、股價等）
- **串流回覆**：SSE streaming，逐字輸出不等待
- **對話管理**：建立/切換/刪除對話，歷史記錄持久化
- **JWT 認證**：單一帳號登入保護，token 24 小時有效
- **Linear 風格 UI**：深色現代介面，Inter 字體，indigo 主題色
- **全 Docker 部署**：一行指令啟動，nginx 反向代理前後端

---

## 技術架構

```
YangChat/
├── backend/                  # FastAPI 後端
│   ├── src/
│   │   ├── api/
│   │   │   ├── auth.py       # JWT 登入 / 登出
│   │   │   ├── conversations.py  # 對話 CRUD
│   │   │   ├── messages.py   # 訊息發送、串流
│   │   │   └── models.py     # 可用模型清單
│   │   ├── services/
│   │   │   └── ai_service.py # Pioneer AI 整合、Function Calling、Tavily 搜尋
│   │   ├── models/
│   │   │   └── schemas.py    # Pydantic 資料模型
│   │   ├── config.py         # 環境設定（pydantic-settings）
│   │   └── database.py       # SQLite + aiosqlite
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                 # React + TypeScript 前端
│   ├── src/app/
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx     # 對話區（訊息列表）
│   │   │   ├── InputBar.tsx       # 輸入框（含圖片上傳）
│   │   │   ├── MessageBubble.tsx  # 訊息氣泡（user / AI）
│   │   │   ├── StreamingBubble.tsx # 串流中的 AI 回覆
│   │   │   ├── Sidebar.tsx        # 對話清單側邊欄
│   │   │   └── ModelSelector.tsx  # 模型下拉選單
│   │   ├── pages/
│   │   │   ├── Login.tsx          # 登入頁
│   │   │   └── Chat.tsx           # 主聊天頁
│   │   ├── hooks/
│   │   │   └── useChat.ts         # 對話狀態管理
│   │   └── services/
│   │       └── api.ts             # API 呼叫封裝
│   ├── nginx.conf            # SPA fallback + API 反向代理
│   └── Dockerfile            # 多階段建構（Node build → nginx serve）
│
├── docker-compose.yml        # 服務編排
├── .env                      # 環境變數（不進版控）
└── README.md                 # 本文件
```

### 技術選型

| 層次 | 技術 |
|------|------|
| 後端框架 | FastAPI + uvicorn |
| AI 整合 | Pioneer AI (OpenAI 相容 API) |
| 即時搜尋 | Tavily Search API |
| 資料庫 | SQLite + aiosqlite |
| 認證 | JWT (python-jose) |
| 前端框架 | React 18 + TypeScript + Vite |
| 樣式 | Tailwind CSS + Linear 設計系統 |
| Markdown | react-markdown + remark-gfm |
| 容器化 | Docker Compose (nginx + FastAPI) |

---

## 快速啟動

### 前置需求

- Docker + Docker Compose
- Pioneer AI API Key（[pioneer.ai](https://pioneer.ai) 申請）
- Tavily API Key（[tavily.com](https://tavily.com) 申請，搜尋功能用，可選）

### 1. 設定環境變數

```bash
cp .env.example .env   # 若無範本，直接建立 .env
```

`.env` 內容：

```env
# Pioneer AI
PIONEER_API_KEY=pio_sk_your_key_here
PIONEER_BASE_URL=https://api.pioneer.ai/v1
DEFAULT_MODEL=claude-sonnet-4-6

# 認證（請改成自己的帳密）
CHAT_USERNAME=yang
CHAT_PASSWORD=your_strong_password

# JWT Secret（至少 32 字元的隨機字串）
JWT_SECRET=your-random-secret-at-least-32-chars

# Tavily 搜尋（可選，不設定則搜尋功能停用）
TAVILY_API_KEY=tvly-your_key_here
```

### 2. 啟動

```bash
docker compose up -d --build
```

### 3. 開啟

瀏覽器前往 [http://localhost](http://localhost)，用 `.env` 設定的帳密登入。

---

## 可用模型

透過 Pioneer AI 提供，全部走 OpenAI 相容 API：

| 分類 | 模型 | Context |
|------|------|---------|
| Claude | claude-sonnet-4-6 | 1M tokens |
| Claude | claude-opus-4-5 / 4-6 / 4-7 | 200K–1M tokens |
| Claude | claude-haiku-4-5 | 200K tokens |
| Qwen | Qwen3-235B / 32B / 8B | 131K–262K tokens |
| MiniMax | MiniMax-M3 / M2.7 | 196K–524K tokens |
| 其他 | MiMo V2.5 Pro | 1M tokens |
| 其他 | Liquid LFM2 24B | 128K tokens |

> **Note**：Pioneer AI 目前所有模型均不支援 vision（圖片輸入），迴紋針圖片上傳功能在此後端下為停用狀態。

---

## AI 搜尋機制

採用 **OpenAI Function Calling** 方式整合：

1. 每次用戶發問，系統帶著 `web_search` tool definition 一起送給 AI
2. AI 自主判斷是否需要即時資訊，若需要則呼叫 `web_search(query=...)`
3. 後端攔截 tool call，呼叫 Tavily Search API 取得搜尋結果
4. 將結果注入回對話，AI 再生成最終回覆
5. 前端顯示「🔍 搜尋中…」提示狀態

---

## API 端點

| Method | Path | 說明 |
|--------|------|------|
| POST | `/api/auth/login` | 登入，回傳 JWT token |
| GET | `/api/models` | 取得可用模型清單 |
| GET | `/api/conversations` | 取得所有對話 |
| POST | `/api/conversations` | 建立新對話 |
| DELETE | `/api/conversations/{id}` | 刪除對話 |
| GET | `/api/conversations/{id}/messages` | 取得對話訊息 |
| POST | `/api/messages/stream` | 送出訊息（SSE 串流回覆） |

所有 `/api/*`（除 `/api/auth/login`）均需帶 `Authorization: Bearer <token>`。

---

## 開發說明

### 本地後端開發

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp ../env.example .env  # 設定環境變數
uvicorn src.main:app --reload --port 8000
```

### 本地前端開發

```bash
cd frontend
npm install
npm run dev   # 開啟 http://localhost:5173
```

前端 `vite.config.ts` 已設定 proxy，將 `/api/*` 轉發到 `http://localhost:8000`。

---

## 維護說明

> **⚠️ 本文件需同步維護**：每次新增功能、修改模型清單、變更 API、調整架構時，請同步更新此 README。
