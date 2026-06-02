from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from src.api.deps import get_current_user, db_dep
from src.models.schemas import SendMessageRequest, SendMessageResponse, MessageOut
from src.services import db_service, ai_service
from src.config import settings
import aiosqlite

router = APIRouter(tags=["messages"])


def _build_history(messages: list) -> list:
    """將 DB messages 轉成 OpenAI messages 格式"""
    result = []
    for m in messages:
        content = ai_service.build_content(m["content"], m.get("images"))
        result.append({"role": m["role"], "content": content})
    return result


@router.post("/send", response_model=SendMessageResponse)
async def send_message(
    body: SendMessageRequest,
    db: aiosqlite.Connection = Depends(db_dep),
    _: str = Depends(get_current_user),
):
    """非 streaming：回傳完整 assistant 訊息"""
    conv = await db_service.get_conversation(db, body.conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    model = body.model or conv["model"] or settings.DEFAULT_MODEL

    # 儲存 user 訊息
    user_msg = await db_service.save_message(
        db, body.conversation_id, "user", body.content, body.images
    )

    # 組建歷史
    history = _build_history(conv["messages"])
    history.append({"role": "user", "content": ai_service.build_content(body.content, body.images)})

    # 呼叫 AI
    try:
        reply = await ai_service.chat_complete(history, model)
    except Exception as e:
        return SendMessageResponse(success=False, error=str(e))

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
    db: aiosqlite.Connection = Depends(db_dep),
    _: str = Depends(get_current_user),
):
    """SSE streaming：先儲存 user 訊息，邊串流邊收集，完成後儲存 assistant 訊息"""
    conv = await db_service.get_conversation(db, body.conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    model = body.model or conv["model"] or settings.DEFAULT_MODEL

    # 儲存 user 訊息
    user_msg = await db_service.save_message(
        db, body.conversation_id, "user", body.content, body.images
    )

    history = _build_history(conv["messages"])
    history.append({"role": "user", "content": ai_service.build_content(body.content, body.images)})

    # streaming generator
    import json
    collected = []

    async def event_generator():
        # 先送 user_message 事件
        yield f"data: {json.dumps({'type': 'user_message', 'message': user_msg})}\n\n"

        # 開始 AI streaming
        try:
            async for chunk in ai_service.chat_stream(history, model):
                if chunk.strip() == "data: [DONE]":
                    break
                # chunk 格式: "data: {\"content\": \"...\"}\n\n"
                try:
                    data_str = chunk.removeprefix("data: ").strip()
                    data = json.loads(data_str)
                    collected.append(data.get("content", ""))
                    yield chunk
                except Exception:
                    pass
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
            return

        # 完整回覆
        full_reply = "".join(collected)

        # 儲存 assistant 訊息（在 generator 外面做會有 db 生命週期問題，用新連線）
        from src.database import get_db
        async_db = await get_db()
        try:
            asst_msg = await db_service.save_message(
                async_db, body.conversation_id, "assistant", full_reply
            )
        finally:
            await async_db.close()

        yield f"data: {json.dumps({'type': 'assistant_message', 'message': asst_msg})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
