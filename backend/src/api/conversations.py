from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from src.api.deps import get_current_user, db_dep
from src.models.schemas import ConversationCreate, ConversationSummary, ConversationDetail
from src.services import db_service, ai_service
import aiosqlite
from typing import List

router = APIRouter(tags=["conversations"])


@router.get("", response_model=List[ConversationSummary])
async def list_conversations(
    db: aiosqlite.Connection = Depends(db_dep),
    current_user: str = Depends(get_current_user),
):
    return await db_service.list_conversations(db, user_id=current_user)


@router.post("", response_model=ConversationDetail)
async def create_conversation(
    body: ConversationCreate,
    background_tasks: BackgroundTasks,
    db: aiosqlite.Connection = Depends(db_dep),
    current_user: str = Depends(get_current_user),
):
    temp_title = body.first_message[:40] or "新對話"
    conv = await db_service.create_conversation(db, body.model, temp_title, user_id=current_user)

    async def _rename_later(conv_id: str, msg: str, model: str, user_id: str) -> None:
        from src.database import get_db_ctx
        title = await ai_service.generate_title(msg, model)
        if title:
            async with get_db_ctx() as bg_db:
                await db_service.rename_conversation(bg_db, conv_id, title, user_id=user_id)

    background_tasks.add_task(_rename_later, conv["id"], body.first_message, body.model, current_user)
    return conv


@router.get("/{conv_id}", response_model=ConversationDetail)
async def get_conversation(
    conv_id: str,
    db: aiosqlite.Connection = Depends(db_dep),
    current_user: str = Depends(get_current_user),
):
    conv = await db_service.get_conversation(db, conv_id, user_id=current_user)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.patch("/{conv_id}/system-prompt")
async def set_system_prompt(
    conv_id: str,
    body: dict,
    db: aiosqlite.Connection = Depends(db_dep),
    current_user: str = Depends(get_current_user),
):
    prompt = (body.get("system_prompt") or "").strip()[:2000]
    ok = await db_service.update_system_prompt(db, conv_id, prompt, user_id=current_user)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"success": True, "system_prompt": prompt}


@router.patch("/{conv_id}/title")
async def rename_conversation(
    conv_id: str,
    body: dict,
    db: aiosqlite.Connection = Depends(db_dep),
    current_user: str = Depends(get_current_user),
):
    title = (body.get("title") or "").strip()[:40]
    if not title:
        raise HTTPException(status_code=422, detail="title 不可為空")
    ok = await db_service.rename_conversation(db, conv_id, title, user_id=current_user)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"success": True, "title": title}


@router.delete("/{conv_id}")
async def delete_conversation(
    conv_id: str,
    db: aiosqlite.Connection = Depends(db_dep),
    current_user: str = Depends(get_current_user),
):
    ok = await db_service.delete_conversation(db, conv_id, user_id=current_user)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"success": True}
