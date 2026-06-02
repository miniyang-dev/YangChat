import hmac
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException
from jose import jwt, JWTError, ExpiredSignatureError
from src.config import settings
from src.models.schemas import LoginRequest, LoginResponse

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)


def create_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRATION_HOURS)
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def verify_token(token: str) -> str:
    """回傳 username，失敗 raise HTTPException"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        username = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Token 缺少 sub")
        return username
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token 已過期，請重新登入")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token 無效")


def _safe_compare(a: str, b: str) -> bool:
    """B-C2: timing-safe 字串比對，防止 timing side-channel 攻擊"""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    # B-C2: 使用 timing-safe 比對
    username_ok = _safe_compare(req.username, settings.CHAT_USERNAME)
    password_ok = _safe_compare(req.password, settings.CHAT_PASSWORD)
    if not (username_ok and password_ok):
        # 不透露是帳號還是密碼錯誤
        return LoginResponse(success=False, message="帳號或密碼錯誤")
    token = create_token(req.username)
    return LoginResponse(success=True, token=token, message="登入成功")


@router.post("/logout")
async def logout():
    # Stateless JWT：前端刪除 token 即可
    return {"success": True, "message": "已登出"}
