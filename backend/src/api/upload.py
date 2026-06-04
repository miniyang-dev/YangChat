"""
upload.py — 檔案上傳 API
POST /api/upload       → 解析文件（PDF/PPTX/DOCX/TXT/MD/CSV），回傳純文字
POST /api/upload-image → 圖片送 Gemini Flash 描述，回傳文字描述
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from pydantic import BaseModel, Field
from src.api.deps import get_current_user, db_dep
from src.config import settings
from src.services.file_service import extract_text, describe_image, generate_image, SUPPORTED_IMAGE_TYPES
import aiosqlite
import base64
import uuid
from pathlib import Path

router = APIRouter(tags=["upload"])

IMAGES_DIR = Path("/data/images")



@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    上傳 PDF / PPTX / TXT / DOCX / MD / CSV 檔案。
    回傳解析後的純文字，供前端在發送訊息時作為 file_context 附帶。
    """
    # C-3: 先讀 MAX_SIZE+1 bytes，避免全量讀入記憶體後才拒絕（OOM 防護）
    MAX_DOC_BYTES = 10 * 1024 * 1024  # 10MB
    content = await file.read(MAX_DOC_BYTES + 1)
    if len(content) > MAX_DOC_BYTES:
        raise HTTPException(status_code=413, detail="檔案超過 10MB 限制")

    try:
        text = extract_text(file.filename or "", content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    preview = text[:300] + "..." if len(text) > 300 else text

    return {
        "filename": file.filename,
        "char_count": len(text),
        "preview": preview,
        "full_text": text,
    }


@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    上傳圖片（JPEG / PNG / GIF / WebP）。
    圖片送給 Gemini Flash 取得詳細文字描述，
    描述文字再當成 file_context 傳給 Pioneer AI 對話。
    """
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="圖片分析功能未設定（缺少 GEMINI_API_KEY）")

    content_type = file.content_type or ""
    if content_type not in SUPPORTED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"不支援的圖片格式：{content_type}，請上傳 JPEG / PNG / GIF / WebP"
        )

    # C-3: 先讀 MAX_SIZE+1 bytes，避免全量讀入記憶體後才拒絕（OOM 防護）
    MAX_IMG_BYTES = 5 * 1024 * 1024  # 5MB
    image_bytes = await file.read(MAX_IMG_BYTES + 1)
    if len(image_bytes) > MAX_IMG_BYTES:
        raise HTTPException(status_code=413, detail="圖片超過 5MB 限制")

    try:
        description = await describe_image(image_bytes, content_type, settings.GEMINI_API_KEY)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # W-6: 不洩漏內部錯誤細節給客戶端
        import logging
        logging.getLogger(__name__).error("圖片分析失敗: %s", e, exc_info=True)
        raise HTTPException(status_code=502, detail="圖片分析失敗，請稍後再試")

    preview = description[:300] + "..." if len(description) > 300 else description

    return {
        "filename": file.filename,
        "content_type": content_type,
        "description_length": len(description),
        "preview": preview,
        "full_text": f"[圖片內容描述]\n{description}",  # 前端用此作為 file_context
    }


# ── Image Generation（Gemini 3.1 Flash Image）─────────────────────────────────

class GenerateImageRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000, description="產圖 prompt")
    conversation_id: str | None = Field(default=None, description="要存入的對話 ID（選填）")


@router.post("/generate-image")
async def generate_image_endpoint(
    body: GenerateImageRequest,
    db: aiosqlite.Connection = Depends(db_dep),
    current_user: dict = Depends(get_current_user),
):
    """
    根據文字 prompt 呼叫 Gemini 3.1 Flash Image 產圖。
    若提供 conversation_id，產圖結果會存入 DB 訊息歷史（重整後仍可見）。
    回傳 image_url：可能是 /api/images/<uuid>.jpg（已存檔）或 base64 data URL（未帶對話 ID）。
    """
    if not settings.GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="產圖功能未設定（缺少 GEMINI_API_KEY）")

    try:
        data_url = await generate_image(body.prompt, settings.GEMINI_API_KEY)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import logging
        logging.getLogger(__name__).error("產圖失敗: %s", e, exc_info=True)
        raise HTTPException(status_code=502, detail="產圖失敗，請稍後再試")

    # 若有 conversation_id，把圖存到 /data/images/ 並寫入 DB messages
    image_url = data_url  # 預設回傳 base64
    if body.conversation_id:
        try:
            from src.services import db_service
            # 把 base64 decode 存成 JPEG 檔
            IMAGES_DIR.mkdir(parents=True, exist_ok=True)
            header, b64data = data_url.split(",", 1)
            img_bytes = base64.b64decode(b64data)
            filename = f"{uuid.uuid4().hex}.jpg"
            filepath = IMAGES_DIR / filename
            filepath.write_bytes(img_bytes)
            image_url = f"/api/images/{filename}"

            # 存入 DB：user 訊息（prompt）+ assistant 訊息（圖片）
            await db_service.save_message(
                db, body.conversation_id, "user", f"[產圖] {body.prompt}"
            )
            await db_service.save_message(
                db, body.conversation_id, "assistant",
                f"已為你產生圖片：{body.prompt}",
                images=[image_url],
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning("產圖存 DB 失敗（不影響回傳）: %s", e)
            image_url = data_url  # 存檔失敗 fallback 回 base64

    return {
        "success": True,
        "image_url": image_url,
        "prompt": body.prompt,
    }
