import json
import httpx
from openai import AsyncOpenAI
from src.config import settings
from typing import AsyncGenerator, Optional

# 可用模型清單
AVAILABLE_MODELS = [
    # Claude 系列（Pioneer AI 提供，不支援 vision）
    {"id": "claude-sonnet-4-6",  "name": "Claude Sonnet 4.6",  "vision": False},
    {"id": "claude-opus-4-5",    "name": "Claude Opus 4.5",    "vision": False},
    {"id": "claude-opus-4-6",    "name": "Claude Opus 4.6",    "vision": False},
    {"id": "claude-opus-4-7",    "name": "Claude Opus 4.7",    "vision": False},
    {"id": "claude-haiku-4-5",   "name": "Claude Haiku 4.5",   "vision": False},
    # Qwen 系列
    {"id": "Qwen/Qwen3-235B-A22B-Instruct-2507", "name": "Qwen3 235B",  "vision": False},
    {"id": "Qwen/Qwen3-32B",                     "name": "Qwen3 32B",   "vision": False},
    {"id": "Qwen/Qwen3-8B",                      "name": "Qwen3 8B",    "vision": False},
    # MiniMax 系列
    {"id": "MiniMaxAI/MiniMax-M3",   "name": "MiniMax M3",   "vision": False},
    {"id": "MiniMaxAI/MiniMax-M2.7", "name": "MiniMax M2.7", "vision": False},
    # 其他
    {"id": "XiaomiMiMo/MiMo-V2.5-Pro", "name": "MiMo V2.5 Pro", "vision": False},
    {"id": "LiquidAI/LFM2-24B-A2B",    "name": "Liquid LFM2 24B", "vision": False},
]

# S1: module-level singleton，複用 httpx 連線池
_client: Optional[AsyncOpenAI] = None

# ── Default System Prompt ─────────────────────────────────────────────────────

DEFAULT_SYSTEM_PROMPT = """你是一位頂尖的 AI 助手，具備廣博的知識與嚴謹的分析能力。

回答規範：
- **完整性**：充分回答使用者的問題，不要省略重要細節，不要用「詳細可另問」等語句截斷
- **深度**：提供成因、底層邏輯、具體案例與可執行方案，而非只給表面答案
- **結構**：善用 markdown 格式（標題、列表、程式碼區塊），讓回答清晰易讀
- **準確性**：不確定的事情明確說不確定，不捏造資訊
- **語言**：使用者用什麼語言提問就用什麼語言回答；預設繁體中文（台灣用語），專有名詞保留英文
- **程式碼**：附語言標籤與關鍵註釋，範例要可直接執行

禁止行為：
- 不得用「我只是 AI」等語句迴避實質回答
- 不得在回答中途說「如需更多請告訴我」後就停止
- 不得無故縮減回答長度
"""

def _inject_default_system(messages: list) -> list:
    """若 messages 中沒有 system role，自動在最前面注入 default system prompt。"""
    has_system = any(m.get("role") == "system" for m in messages)
    if has_system:
        return messages
    return [{"role": "system", "content": DEFAULT_SYSTEM_PROMPT}] + messages

# ── Tool Definitions ─────────────────────────────────────────────────────────

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "搜尋網路上的最新資訊。當問題涉及即時資訊（新聞、天氣、股價、匯率、賽事、"
                "最新事件）或你不確定的事實時，呼叫此工具取得真實資料後再回答。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜尋關鍵字，用中文或英文皆可，盡量具體",
                    },
                },
                "required": ["query"],
            },
        },
    }
]

# ── Tavily Search ─────────────────────────────────────────────────────────────

async def _tavily_search(query: str) -> str:
    """呼叫 Tavily Search API，回傳格式化的搜尋結果文字"""
    if not settings.TAVILY_API_KEY:
        return "（搜尋功能未設定 API key）"

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key": settings.TAVILY_API_KEY,
                "query": query,
                "search_depth": "basic",
                "max_results": 5,
                "include_answer": True,        # 讓 Tavily 也給一個摘要答案
            },
        )
        resp.raise_for_status()
        data = resp.json()

    lines = []

    # 如果 Tavily 有直接答案
    if data.get("answer"):
        lines.append(f"摘要：{data['answer']}\n")

    # 列出各筆搜尋結果
    for i, r in enumerate(data.get("results", []), 1):
        title = r.get("title", "")
        url = r.get("url", "")
        content = r.get("content", "").strip()[:300]   # 限制長度
        lines.append(f"[{i}] {title}\n{content}\n來源：{url}")

    return "\n\n".join(lines) if lines else "（無搜尋結果）"


# ── OpenAI Client ─────────────────────────────────────────────────────────────

def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.PIONEER_API_KEY,
            base_url=settings.PIONEER_BASE_URL,
        )
    return _client


def build_content(text: str, images: Optional[list] = None):
    """組建 OpenAI message content（純文字 or 多模態）"""
    if not images:
        return text
    parts = []
    for img in images:
        parts.append({"type": "image_url", "image_url": {"url": img}})
    parts.append({"type": "text", "text": text})
    return parts


# ── Tool Executor ─────────────────────────────────────────────────────────────

async def _execute_tool(name: str, arguments: str) -> str:
    """執行工具，回傳結果字串"""
    try:
        args = json.loads(arguments)
    except json.JSONDecodeError:
        return "（工具參數解析失敗）"

    if name == "web_search":
        return await _tavily_search(args.get("query", ""))

    return f"（未知工具：{name}）"


# ── Non-streaming ─────────────────────────────────────────────────────────────

async def generate_title(first_message: str, model: str) -> str:
    """根據第一則訊息，用 AI 產生 5 字以內的對話標題（非同步背景用）"""
    client = get_client()
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"請用 10 字以內（繁體中文）為以下訊息取一個標題，"
                        f"只回傳標題文字，不要標點符號、引號或任何多餘文字：\n\n{first_message[:200]}"
                    ),
                }
            ],
            max_tokens=30,
        )
        title = response.choices[0].message.content or ""
        return title.strip()[:40] or first_message[:40]
    except Exception:
        return first_message[:40]


async def chat_complete(messages: list, model: str) -> str:
    """非 streaming：支援 tool call loop，回傳完整回覆文字"""
    client = get_client()
    msgs = _inject_default_system(list(messages))

    for _ in range(5):  # 最多 5 輪 tool call
        response = await client.chat.completions.create(
            model=model,
            messages=msgs,
            tools=TOOLS,  # type: ignore[arg-type]
            tool_choice="auto",
            max_tokens=8192,
        )
        msg = response.choices[0].message

        if not msg.tool_calls:
            return msg.content or ""

        # 把 assistant tool_call 訊息加入歷史
        msgs.append(msg)

        # 執行所有 tool calls，把結果加回歷史
        for tc in msg.tool_calls:
            result = await _execute_tool(tc.function.name, tc.function.arguments)
            msgs.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "content": result,
            })

    # 超過輪次上限，直接問一次不帶工具
    response = await client.chat.completions.create(
        model=model,
        messages=msgs,
        max_tokens=8192,
    )
    return response.choices[0].message.content or ""


# ── Streaming with Tool Call Loop ─────────────────────────────────────────────

async def chat_stream(
    messages: list,
    model: str,
) -> AsyncGenerator[str, None]:
    """
    SSE streaming，支援 tool call。
    流程：
      1. 發送帶 tools 的 stream 請求
      2. 收集 delta，如果有 tool_call chunk 就組裝
      3. 若偵測到 tool_call → 執行工具 → 把結果加回 messages → 重新 stream
      4. 若純文字 → 直接 yield SSE chunks
    """
    client = get_client()
    msgs = _inject_default_system(list(messages))

    for round_num in range(5):  # 最多 5 輪
        stream = await client.chat.completions.create(
            model=model,
            messages=msgs,
            tools=TOOLS,  # type: ignore[arg-type]
            tool_choice="auto",
            stream=True,
            max_tokens=8192,
        )

        # 收集這一輪的 stream
        tool_calls_map: dict[int, dict] = {}   # index → {id, name, arguments}
        full_content = ""
        finish_reason = None

        async for chunk in stream:
            if not chunk.choices:
                continue

            delta = chunk.choices[0].delta
            finish_reason = chunk.choices[0].finish_reason

            # 純文字 delta → 立即 yield 給前端
            if delta.content:
                full_content += delta.content
                yield f"data: {json.dumps({'content': delta.content})}\n\n"

            # tool_call delta → 累積組裝
            if delta.tool_calls:
                for tc_delta in delta.tool_calls:
                    idx = tc_delta.index
                    if idx not in tool_calls_map:
                        tool_calls_map[idx] = {
                            "id": "",
                            "name": "",
                            "arguments": "",
                        }
                    if tc_delta.id:
                        tool_calls_map[idx]["id"] = tc_delta.id
                    if tc_delta.function:
                        if tc_delta.function.name:
                            tool_calls_map[idx]["name"] += tc_delta.function.name
                        if tc_delta.function.arguments:
                            tool_calls_map[idx]["arguments"] += tc_delta.function.arguments

        # 這一輪沒有 tool_call → 正常結束
        if not tool_calls_map:
            yield "data: [DONE]\n\n"
            return

        # 有 tool_call → 通知前端正在搜尋（UX 提示）
        tool_names = [v["name"] for v in tool_calls_map.values()]
        yield f"data: {json.dumps({'tool_use': tool_names})}\n\n"

        # 把 assistant 的 tool_call 訊息加入歷史
        assistant_msg = {
            "role": "assistant",
            "content": full_content or None,
            "tool_calls": [
                {
                    "id": v["id"],
                    "type": "function",
                    "function": {
                        "name": v["name"],
                        "arguments": v["arguments"],
                    },
                }
                for _, v in sorted(tool_calls_map.items())
            ],
        }
        msgs.append(assistant_msg)

        # 執行工具
        for v in sorted(tool_calls_map.items(), key=lambda x: x[0]):
            tc = v[1]
            result = await _execute_tool(tc["name"], tc["arguments"])
            msgs.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": result,
            })

    # 超過輪次上限
    yield f"data: {json.dumps({'content': '（工具呼叫超過次數上限）'})}\n\n"
    yield "data: [DONE]\n\n"
