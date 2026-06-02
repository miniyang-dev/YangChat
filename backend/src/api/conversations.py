from fastapi import APIRouter, Depends, HTTPException
from src.api.deps import get_current_user, db_dep
from src.models.schemas import ConversationCreate, ConversationSummary, ConversationDetail
from src.services import db_service
import aiosqlite
from typing import List

router = APIRouter(tags=["conversations"])


@router.get("", response_model=List[ConversationSummary])
async def list_conversations(
    db: aiosqlite.Connection = Depends(db_dep),
    _: str = Depends(get_current_user),
):
    return await db_service.list_conversations(db)


@router.post("", response_model=ConversationDetail)
async def create_conversation(
    body: ConversationCreate,
    db: aiosqlite.Connection = Depends(db_dep),
    _: str = Depends(get_current_user),
):
    title = body.first_message[:40] or "新對話"
    return await db_service.create_conversation(db, body.model, title)


@router.get("/{conv_id}", response_model=ConversationDetail)
async def get_conversation(
    conv_id: str,
    db: aiosqlite.Connection = Depends(db_dep),
    _: str = Depends(get_current_user),
):
    conv = await db_service.get_conversation(db, conv_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


@router.delete("/{conv_id}")
async def delete_conversation(
    conv_id: str,
    db: aiosqlite.Connection = Depends(db_dep),
    _: str = Depends(get_current_user),
):
    ok = await db_service.delete_conversation(db, conv_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"success": True}
