import hmac
import logging
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import APIRouter, HTTPException
from jose import jwt, JWTError, ExpiredSignatureError

from src.config import settings
from src.database import get_db_ctx
from src.models.schemas import LoginRequest, LoginResponse

router = APIRouter(tags=["auth"])
logger = logging.getLogger(__name__)


# ── Password helpers ──────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ── JWT ───────────────────────────────────────────────────────────────────────

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


# ── Bootstrap ─────────────────────────────────────────────────────────────────

async def bootstrap_admin() -> None:
    """
    若 users 表為空，自動用 .env 的 CHAT_USERNAME / CHAT_PASSWORD
    建立第一個 admin 帳號，確保向下相容。
    """
    username = settings.CHAT_USERNAME
    password = settings.CHAT_PASSWORD
    if not username or not password:
        return

    async with get_db_ctx() as db:
        async with db.execute("SELECT COUNT(*) FROM users") as cur:
            row = await cur.fetchone()
            count = row[0] if row else 0

        if count == 0:
            now = datetime.now(timezone.utc).isoformat()
            await db.execute(
                "INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?,?,?,?,?)",
                (str(uuid.uuid4()), username, hash_password(password), "admin", now),
            )
            await db.commit()
            logger.info("Bootstrap: admin '%s' 建立完成", username)


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    async with get_db_ctx() as db:
        async with db.execute(
            "SELECT password_hash FROM users WHERE username = ?", (req.username,)
        ) as cur:
            row = await cur.fetchone()

    if row is None or not verify_password(req.password, row["password_hash"]):
        return LoginResponse(success=False, message="帳號或密碼錯誤")

    token = create_token(req.username)
    return LoginResponse(success=True, token=token, message="登入成功")


@router.post("/logout")
async def logout():
    # Stateless JWT：前端刪除 token 即可
    return {"success": True, "message": "已登出"}
