"""
export.py — AI 產出 PPTX API
POST /api/export/pptx → AI 產生投影片 JSON → 組裝 .pptx → 回傳下載
"""
import json
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pydantic import BaseModel, Field
from src.api.deps import get_current_user
from src.services.export_service import build_pptx
from src.services.ai_service import AIService

router = APIRouter()


class PptxRequest(BaseModel):
    prompt: str = Field(..., description="使用者需求，例如「幫我做5頁關於AI的行銷簡報」")
    slide_count: int = Field(default=5, ge=1, le=20, description="投影片張數（1-20）")


SYSTEM_PROMPT = """你是一個簡報製作專家。
根據使用者需求，產出投影片結構，必須回傳合法 JSON，格式如下：
[
  {"title": "投影片標題", "content": ["重點1", "重點2", "重點3"]},
  ...
]
只回傳 JSON，不要任何說明文字、不要 markdown code block。每張投影片 content 最多 5 個重點。"""


@router.post("/export/pptx")
async def export_pptx(
    req: PptxRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    根據使用者需求，讓 AI 產生投影片結構，組裝成 .pptx 回傳下載。
    """
    ai = AIService()
    user_msg = f"請製作 {req.slide_count} 頁投影片，主題：{req.prompt}"

    # 呼叫 AI 收集完整回應（非 streaming 輸出給前端，內部等待）
    full_response = ""
    async for chunk in ai.stream_response(
        messages=[{"role": "user", "content": user_msg}],
        system_prompt=SYSTEM_PROMPT,
    ):
        full_response += chunk

    # 清理可能的 markdown code block 包裝，再解析 JSON
    clean = full_response.strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        # 移除首行 ```json 或 ``` 和末行 ```
        clean = "\n".join(lines[1:-1]).strip()

    try:
        slides_data = json.loads(clean)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail=f"AI 回傳格式錯誤，請重試。原始回應：{full_response[:200]}"
        )

    if not isinstance(slides_data, list):
        raise HTTPException(status_code=500, detail="AI 回傳格式不正確，預期為陣列")

    # 組裝 PPTX
    pptx_bytes = build_pptx(slides_data)

    return Response(
        content=pptx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": 'attachment; filename="yangchat-export.pptx"'},
    )
