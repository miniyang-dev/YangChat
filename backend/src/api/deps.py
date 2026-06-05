from fastapi import Depends, HTTPException, Header
from typing import Optional
from src.api.auth import verify_token
from src.database import get_db, get_db_ctx
import aiosqlite


async def get_current_user(
    authorization: Optional[str] = Header(None)
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header required")
    token = authorization.removeprefix("Bearer ").strip()
    return verify_token(token)


async def get_admin_user(
    current_user: str = Depends(get_current_user),
) -> str:
    """驗證目前使用者具有 admin role，否則回傳 403"""
    async with get_db_ctx() as db:
        async with db.execute(
            "SELECT role FROM users WHERE username = ?", (current_user,)
        ) as cur:
            row = await cur.fetchone()

    if row is None or row["role"] != "admin":
        raise HTTPException(status_code=403, detail="需要管理員權限")
    return current_user


async def db_dep() -> aiosqlite.Connection:
    db = await get_db()
    try:
        yield db
    finally:
        await db.close()
