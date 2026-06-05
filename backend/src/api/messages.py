import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from src.api.deps import get_current_user, db_dep
from src.models.schemas import SendMessageRequest, SendMessageResponse, MessageOut
from src.services import db_service, ai_service
from src.config import settings
import aiosqlite

router = APIRouter(tags=["messages"])
logger = logging.getLogger(__name__)


def _build_history(messages: list, system_prompt: str = "") -> list:
    """將 DB messages 轉成 OpenAI messages 格式，若有 system_prompt 則置首"""
    result = []
    if system_prompt.strip():
        result.append({"role": "system", "content": system_prompt.strip()})
    for m in messages:
        content = ai_service.build_content(m["content"], m.get("images"))
        result.append({"role": m["role"], "content": content})
    return result


def _build_user_content_with_file(content: str, images: list | None, file_context: str | None) -> str | list:
    """
    如果有 file_context，把文件內容作為前綴注入 user 訊息。
    讓 AI 知道使用者附加了什麼文件，再回答問題。
    """
    if file_context:
        enriched = (
            f"[附加文件內容]\n{file_context}\n\n[使用者訊息]\n{content}"
            if content
            else f"[附加文件內容]\n{file_context}"
        )
        return ai_service.build_content(enriched, images)
    return ai_service.build_content(content, images)


@router.post("/send", response_model=SendMessageResponse)
async def send_message(
    body: SendMessageRequest,
    db: aiosqlite.Connection = Depends(db_dep),
    current_user: str = Depends(get_current_user),
):
    """非 streaming：回傳完整 assistant 訊息"""
    conv = await db_service.get_conversation(db, body.conversation_id, user_id=current_user)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    model = body.model or conv["model"] or settings.DEFAULT_MODEL

    # W-4: 驗證 model 是否在白名單內
    from src.services.ai_service import AVAILABLE_MODELS
    valid_model_ids = {m["id"] for m in AVAILABLE_MODELS}
    if body.model and body.model not in valid_model_ids:
        raise HTTPException(status_code=400, detail=f"不支援的模型：{body.model}")

    # 儲存 user 訊息（DB 只存原始內容，file_context 不存）
    user_msg = await db_service.save_message(
        db, body.conversation_id, "user", body.content, body.images
    )

    # 組建歷史 + 附加文件 context
    history = _build_history(conv["messages"], conv.get("system_prompt", ""))
    history.append({
        "role": "user",
        "content": _build_user_content_with_file(body.content, body.images, body.file_context),
    })

    # 呼叫 AI — W2: 錯誤不洩漏內部細節
    try:
        reply = await ai_service.chat_complete(history, model)
    except Exception as e:
        logger.error("AI 呼叫失敗: %s", e, exc_info=True)
        raise HTTPException(status_code=502, detail="AI 服務暫時無法使用，請稍後再試")

    # 儲存 assistant 訊息
    asst_msg = await db_service.save_message(
        db, body.conversation_id, "assistant", reply
    )

    return SendMessageResponse(
        success=True,
        user_message=MessageOut(**user_msg),
        assistant_message=MessageOut(**asst_msg),
    )


@router.post("/stream")
async def stream_message(
    body: SendMessageRequest,
    background_tasks: BackgroundTasks,
    db: aiosqlite.Connection = Depends(db_dep),
    current_user: str = Depends(get_current_user),
):
    """SSE streaming — B-C3: 用 BackgroundTask 確保斷線也能存入 assistant 訊息"""
    conv = await db_service.get_conversation(db, body.conversation_id, user_id=current_user)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    model = body.model or conv["model"] or settings.DEFAULT_MODEL

    # W-4: 驗證 model 是否在白名單內（stream 端點）
    from src.services.ai_service import AVAILABLE_MODELS
    valid_model_ids = {m["id"] for m in AVAILABLE_MODELS}
    if body.model and body.model not in valid_model_ids:
        raise HTTPException(status_code=400, detail=f"不支援的模型：{body.model}")

    # 儲存 user 訊息（DB 只存原始內容，file_context 不存進 DB 以免污染歷史）
    user_msg = await db_service.save_message(
        db, body.conversation_id, "user", body.content, body.images
    )

    # 組建歷史 + 附加文件 context（僅這次呼叫注入，不存 DB）
    history = _build_history(conv["messages"], conv.get("system_prompt", ""))
    history.append({
        "role": "user",
        "content": _build_user_content_with_file(body.content, body.images, body.file_context),
    })

    # 用 list 收集完整回覆（可在 generator 外被 background task 讀取）
    collected: list[str] = []
    conv_id = body.conversation_id

    async def save_assistant_reply(full_reply: str) -> None:
        """B-C3: 在 BackgroundTask 中用獨立連線儲存 assistant 訊息，即使客戶端斷線也會執行"""
        if not full_reply.strip():
            return
        from src.database import get_db_ctx
        try:
            async with get_db_ctx() as bg_db:
                await db_service.save_message(bg_db, conv_id, "assistant", full_reply)
        except Exception as e:
            logger.error("Background save assistant message failed: %s", e, exc_info=True)

    async def event_generator():
        # 先送 user_message 事件
        yield f"data: {json.dumps({'type': 'user_message', 'message': user_msg})}\n\n"

        full_reply = ""
        # 開始 AI streaming
        try:
            async for chunk in ai_service.chat_stream(history, model):
                if chunk.strip() == "data: [DONE]":
                    break
                try:
                    data_str = chunk.removeprefix("data: ").strip()
                    data = json.loads(data_str)
                    delta = data.get("content", "")
                    collected.append(delta)
                    full_reply += delta
                    yield chunk
                except Exception as e:
                    logger.debug("SSE parse skip: %s", e)
        except Exception as e:
            logger.error("AI streaming 失敗: %s", e, exc_info=True)
            # W2: 不洩漏內部錯誤細節
            yield f"data: {json.dumps({'type': 'error', 'error': 'AI 服務暫時無法使用'})}\n\n"
            return

        # 正常完成：先嘗試直接存（正常流程），失敗才排程 background task（斷線保護）
        full_reply = "".join(collected)
        try:
            asst_msg = await db_service.save_message(
                db, conv_id, "assistant", full_reply
            )
            yield f"data: {json.dumps({'type': 'assistant_message', 'message': asst_msg})}\n\n"
        except Exception as e:
            logger.error("Direct save failed, falling back to background task: %s", e)
            # C-1: 直接存失敗才 fallback 到 background task，避免雙重寫入
            background_tasks.add_task(save_assistant_reply, full_reply)
            # 即使存檔失敗，仍然要告知前端 streaming 完成（用 content 代替完整 message）
            yield f"data: {json.dumps({'type': 'assistant_message', 'message': {'id': '', 'conversation_id': conv_id, 'role': 'assistant', 'content': full_reply, 'images': None, 'created_at': ''}})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


class RegenerateRequest(BaseModel):
    conversation_id: str
    message_id: str   # 要重新生成的 assistant message（其前一則 user message 為起點）
    model: Optional[str] = None


@router.post("/regenerate")
async def regenerate_message(
    body: RegenerateRequest,
    background_tasks: BackgroundTasks,
    db: aiosqlite.Connection = Depends(db_dep),
    current_user: str = Depends(get_current_user),
):
    """重新生成指定 assistant 訊息：找到它前一則 user 訊息，截斷後重新 stream。"""
    conv = await db_service.get_conversation(db, body.conversation_id, user_id=current_user)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    model = body.model or conv["model"] or settings.DEFAULT_MODEL

    from src.services.ai_service import AVAILABLE_MODELS
    valid_model_ids = {m["id"] for m in AVAILABLE_MODELS}
    if body.model and body.model not in valid_model_ids:
        raise HTTPException(status_code=400, detail=f"不支援的模型：{body.model}")

    # 找到 message_id 以及其前一則 user message
    msgs = conv["messages"]
    target_idx = next((i for i, m in enumerate(msgs) if m["id"] == body.message_id), None)
    if target_idx is None:
        raise HTTPException(status_code=404, detail="Message not found")

    # 找前一則 user 訊息
    user_msg_idx = next(
        (i for i in range(target_idx - 1, -1, -1) if msgs[i]["role"] == "user"), None
    )
    if user_msg_idx is None:
        raise HTTPException(status_code=400, detail="找不到對應的 user 訊息")

    user_msg = msgs[user_msg_idx]

    # 刪除 user message 之後（含）的所有訊息（含原 user msg 本身）
    await db_service.delete_messages_from(db, body.conversation_id, user_msg["id"])

    # 重新存 user message
    new_user_msg = await db_service.save_message(
        db, body.conversation_id, "user", user_msg["content"], user_msg.get("images")
    )

    # 重建歷史（截斷到 user_msg 之前）
    history = _build_history(msgs[:user_msg_idx], conv.get("system_prompt", ""))
    history.append({
        "role": "user",
        "content": ai_service.build_content(user_msg["content"], user_msg.get("images")),
    })

    collected: list[str] = []
    conv_id = body.conversation_id

    async def save_assistant_reply(full_reply: str) -> None:
        if not full_reply.strip():
            return
        from src.database import get_db_ctx
        try:
            async with get_db_ctx() as bg_db:
                await db_service.save_message(bg_db, conv_id, "assistant", full_reply)
        except Exception as e:
            logger.error("Regenerate background save failed: %s", e, exc_info=True)

    async def event_generator():
        # 先送新的 user_message（讓前端更新 ID）
        yield f"data: {json.dumps({'type': 'user_message', 'message': new_user_msg})}\n\n"

        full_reply = ""
        try:
            async for chunk in ai_service.chat_stream(history, model):
                if chunk.strip() == "data: [DONE]":
                    break
                try:
                    data_str = chunk.removeprefix("data: ").strip()
                    data = json.loads(data_str)
                    delta = data.get("content", "")
                    collected.append(delta)
                    full_reply += delta
                    yield chunk
                except Exception as e:
                    logger.debug("SSE parse skip: %s", e)
        except Exception as e:
            logger.error("Regenerate streaming 失敗: %s", e, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'error': 'AI 服務暫時無法使用'})}\n\n"
            return

        full_reply = "".join(collected)
        try:
            asst_msg = await db_service.save_message(db, conv_id, "assistant", full_reply)
            yield f"data: {json.dumps({'type': 'assistant_message', 'message': asst_msg})}\n\n"
        except Exception as e:
            logger.error("Regenerate direct save failed: %s", e)
            background_tasks.add_task(save_assistant_reply, full_reply)
            yield f"data: {json.dumps({'type': 'assistant_message', 'message': {'id': '', 'conversation_id': conv_id, 'role': 'assistant', 'content': full_reply, 'images': None, 'created_at': ''}})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
