"""
upload.py — 檔案上傳 API
POST /api/upload       → 解析文件（PDF/PPTX/DOCX/TXT/MD/CSV），回傳純文字
POST /api/upload-image → 圖片送 Gemini Flash 描述，回傳文字描述
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from src.api.deps import get_current_user
from src.config import settings
from src.services.file_service import extract_text, describe_image, SUPPORTED_IMAGE_TYPES

router = APIRouter()


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    上傳 PDF / PPTX / TXT / DOCX / MD / CSV 檔案。
    回傳解析後的純文字，供前端在發送訊息時作為 file_context 附帶。
    """
    content = await file.read()

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

    image_bytes = await file.read()

    try:
        description = await describe_image(image_bytes, content_type, settings.GEMINI_API_KEY)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"圖片分析失敗：{str(e)[:200]}")

    preview = description[:300] + "..." if len(description) > 300 else description

    return {
        "filename": file.filename,
        "content_type": content_type,
        "description_length": len(description),
        "preview": preview,
        "full_text": f"[圖片內容描述]\n{description}",  # 前端用此作為 file_context
    }
