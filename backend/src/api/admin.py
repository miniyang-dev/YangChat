"""
POST   /api/admin/users               建立帳號（admin only）
GET    /api/admin/users               列出所有帳號（admin only）
DELETE /api/admin/users/{username}    刪除帳號（admin only，不能刪自己）
PATCH  /api/admin/users/{username}    修改密碼或 role（admin only）
GET    /api/admin/me/role             取得目前登入者的 role（所有登入者可用）
"""
import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from src.api.auth import hash_password
from src.api.deps import get_admin_user, get_current_user, db_dep
import aiosqlite

router = APIRouter(tags=["admin"])
logger = logging.getLogger(__name__)


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    username: str
    password: str
    role: str = "user"

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2 or len(v) > 32:
            raise ValueError("帳號長度需 2-32 字元")
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("帳號只能包含英數字、底線、連字號")
        return v

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("密碼長度至少 6 字元")
        return v

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str) -> str:
        if v not in ("admin", "user"):
            raise ValueError("role 只能是 admin 或 user")
        return v


class UpdateUserRequest(BaseModel):
    password: str | None = None
    role: str | None = None

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str | None) -> str | None:
        if v is not None and len(v) < 6:
            raise ValueError("密碼長度至少 6 字元")
        return v

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str | None) -> str | None:
        if v is not None and v not in ("admin", "user"):
            raise ValueError("role 只能是 admin 或 user")
        return v


class UserOut(BaseModel):
    username: str
    role: str
    created_at: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/me/role")
async def get_my_role(
    current_user: str = Depends(get_current_user),
    db: aiosqlite.Connection = Depends(db_dep),
):
    """取得目前登入者的 role（前端用來決定是否顯示管理入口）"""
    async with db.execute(
        "SELECT role FROM users WHERE username = ?", (current_user,)
    ) as cur:
        row = await cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="使用者不存在")
    return {"username": current_user, "role": row["role"]}


@router.get("/users", response_model=list[UserOut])
async def list_users(
    _admin: str = Depends(get_admin_user),
    db: aiosqlite.Connection = Depends(db_dep),
):
    async with db.execute(
        "SELECT username, role, created_at FROM users ORDER BY created_at"
    ) as cur:
        rows = await cur.fetchall()
    return [UserOut(username=r["username"], role=r["role"], created_at=r["created_at"]) for r in rows]


@router.post("/users", response_model=UserOut, status_code=201)
async def create_user(
    req: CreateUserRequest,
    _admin: str = Depends(get_admin_user),
    db: aiosqlite.Connection = Depends(db_dep),
):
    # 檢查帳號是否已存在
    async with db.execute(
        "SELECT id FROM users WHERE username = ?", (req.username,)
    ) as cur:
        if await cur.fetchone():
            raise HTTPException(status_code=409, detail="帳號已存在")

    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        "INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?,?,?,?,?)",
        (str(uuid.uuid4()), req.username, hash_password(req.password), req.role, now),
    )
    await db.commit()
    logger.info("Admin created user '%s' (role=%s)", req.username, req.role)
    return UserOut(username=req.username, role=req.role, created_at=now)


@router.patch("/users/{username}", response_model=UserOut)
async def update_user(
    username: str,
    req: UpdateUserRequest,
    admin_user: str = Depends(get_admin_user),
    db: aiosqlite.Connection = Depends(db_dep),
):
    # 確認目標使用者存在
    async with db.execute(
        "SELECT role, created_at FROM users WHERE username = ?", (username,)
    ) as cur:
        row = await cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="使用者不存在")

    # 不允許 admin 降自己的 role
    if username == admin_user and req.role == "user":
        raise HTTPException(status_code=400, detail="不能降低自己的管理員權限")

    if req.password is not None:
        await db.execute(
            "UPDATE users SET password_hash = ? WHERE username = ?",
            (hash_password(req.password), username),
        )
    if req.role is not None:
        await db.execute(
            "UPDATE users SET role = ? WHERE username = ?",
            (req.role, username),
        )
    await db.commit()

    new_role = req.role if req.role is not None else row["role"]
    return UserOut(username=username, role=new_role, created_at=row["created_at"])


@router.delete("/users/{username}", status_code=200)
async def delete_user(
    username: str,
    admin_user: str = Depends(get_admin_user),
    db: aiosqlite.Connection = Depends(db_dep),
):
    if username == admin_user:
        raise HTTPException(status_code=400, detail="不能刪除自己的帳號")

    async with db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ) as cur:
        if not await cur.fetchone():
            raise HTTPException(status_code=404, detail="使用者不存在")

    await db.execute("DELETE FROM users WHERE username = ?", (username,))
    await db.commit()
    logger.info("Admin '%s' deleted user '%s'", admin_user, username)
    return {"success": True, "message": f"帳號 {username} 已刪除"}
