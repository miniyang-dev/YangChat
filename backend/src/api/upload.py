"""
upload.py — 檔案上傳 API
POST /api/upload  → 解析檔案，回傳文字摘要與完整文字
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from src.api.deps import get_current_user
from src.services.file_service import extract_text

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
        "full_text": text,  # 前端暫存，發訊息時附帶
    }
