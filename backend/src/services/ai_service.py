import json
from openai import AsyncOpenAI
from src.config import settings
from typing import AsyncGenerator, Optional

# 可用模型清單
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


def build_content(text: str, images: Optional[list] = None):
    """組建 OpenAI message content（純文字 or 多模態）"""
    if not images:
        return text
    parts = []
    for img in images:
        # 前端傳來 data:image/jpeg;base64,xxx 格式
        parts.append({"type": "image_url", "image_url": {"url": img}})
    parts.append({"type": "text", "text": text})
    return parts


async def chat_complete(
    messages: list,
    model: str,
) -> str:
    """非 streaming：回傳完整回覆文字"""
    client = get_client()
    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=4096,
    )
    return response.choices[0].message.content or ""


async def chat_stream(
    messages: list,
    model: str,
) -> AsyncGenerator[str, None]:
    """SSE streaming，yield SSE 格式字串"""
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
