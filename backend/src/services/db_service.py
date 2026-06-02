import uuid
import json
from datetime import datetime, timezone
from aiosqlite import Connection
from typing import Optional


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Conversations ──────────────────────────────────────────

async def list_conversations(db: Connection) -> list:
    async with db.execute(
        "SELECT id, title, model, updated_at FROM conversations ORDER BY updated_at DESC"
    ) as cur:
        rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def create_conversation(db: Connection, model: str, title: str) -> dict:
    conv_id = str(uuid.uuid4())
    now = now_iso()
    clean_title = title[:50].strip() or "新對話"
    await db.execute(
        "INSERT INTO conversations (id, title, model, created_at, updated_at) VALUES (?,?,?,?,?)",
        (conv_id, clean_title, model, now, now)
    )
    await db.commit()
    return {"id": conv_id, "title": clean_title, "model": model,
            "created_at": now, "updated_at": now, "messages": []}


async def get_conversation(db: Connection, conv_id: str) -> Optional[dict]:
    async with db.execute(
        "SELECT * FROM conversations WHERE id=?", (conv_id,)
    ) as cur:
        row = await cur.fetchone()
    if not row:
        return None
    conv = dict(row)
    conv["messages"] = await list_messages(db, conv_id)
    return conv


async def delete_conversation(db: Connection, conv_id: str) -> bool:
    async with db.execute(
        "SELECT id FROM conversations WHERE id=?", (conv_id,)
    ) as cur:
        if not await cur.fetchone():
            return False
    await db.execute("DELETE FROM conversations WHERE id=?", (conv_id,))
    await db.commit()
    return True


# ── Messages ───────────────────────────────────────────────

async def list_messages(db: Connection, conv_id: str) -> list:
    async with db.execute(
        "SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at",
        (conv_id,)
    ) as cur:
        rows = await cur.fetchall()
    result = []
    for r in rows:
        msg = dict(r)
        msg["images"] = json.loads(msg["images"]) if msg.get("images") else None
        result.append(msg)
    return result


async def save_message(
    db: Connection,
    conv_id: str,
    role: str,
    content: str,
    images: Optional[list] = None,
) -> dict:
    msg_id = str(uuid.uuid4())
    now = now_iso()
    images_json = json.dumps(images) if images else None
    await db.execute(
        "INSERT INTO messages (id, conversation_id, role, content, images, created_at) VALUES (?,?,?,?,?,?)",
        (msg_id, conv_id, role, content, images_json, now)
    )
    # 更新 conversation updated_at
    await db.execute(
        "UPDATE conversations SET updated_at=? WHERE id=?", (now, conv_id)
    )
    await db.commit()
    return {"id": msg_id, "conversation_id": conv_id, "role": role,
            "content": content, "images": images, "created_at": now}
