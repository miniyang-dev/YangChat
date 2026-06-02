import os
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException
from jose import jwt
from src.config import settings
from src.models.schemas import LoginRequest, LoginResponse

router = APIRouter(tags=["auth"])


def create_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRATION_HOURS)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def verify_token(token: str) -> str:
    """回傳 username，失敗 raise HTTPException"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return payload["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    if req.username != settings.CHAT_USERNAME or req.password != settings.CHAT_PASSWORD:
        return LoginResponse(success=False, message="帳號或密碼錯誤")
    token = create_token(req.username)
    return LoginResponse(success=True, token=token, message="登入成功")


@router.post("/logout")
async def logout():
    # Stateless JWT：前端刪除 token 即可
    return {"success": True, "message": "已登出"}
