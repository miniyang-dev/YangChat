from fastapi import Depends, HTTPException, Header
from typing import Optional
from src.api.auth import verify_token
from src.database import get_db
import aiosqlite


async def get_current_user(
    authorization: Optional[str] = Header(None)
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization header required")
    token = authorization.removeprefix("Bearer ").strip()
    return verify_token(token)


async def db_dep() -> aiosqlite.Connection:
    db = await get_db()
    try:
        yield db
    finally:
        await db.close()
