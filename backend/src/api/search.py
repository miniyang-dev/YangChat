"""
GET /api/search — FTS5 全文搜尋歷史訊息

Query params:
  q      : 搜尋關鍵字（必填，1-100 字）
  scope  : "all" | "user" | "assistant"（預設 "all"）
  date   : "all" | "today" | "week" | "month"（預設 "all"）
  limit  : 回傳筆數上限（預設 20，最大 50）

回傳：
  [{
    message_id, conversation_id, conversation_title,
    role, snippet,          # FTS5 highlight 片段（含 **bold** 標記）
    created_at
  }]
"""
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
import aiosqlite

from src.api.deps import get_current_user, db_dep

router = APIRouter(tags=["search"])
logger = logging.getLogger(__name__)

# FTS5 highlight 標記（前後加 ** 讓前端可以高亮）
_HL_START = "**"
_HL_END = "**"


class SearchResult(BaseModel):
    message_id: str
    conversation_id: str
    conversation_title: str
    role: str
    snippet: str        # 含 **keyword** 的 context 片段
    created_at: str


def _date_cutoff(date: str) -> str | None:
    """回傳 ISO 8601 cutoff，搜尋 created_at >= 此值"""
    now = datetime.now(timezone.utc)
    if date == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    if date == "week":
        return (now - timedelta(days=7)).isoformat()
    if date == "month":
        return (now - timedelta(days=30)).isoformat()
    return None  # "all"


@router.get("/search", response_model=list[SearchResult])
async def search_messages(
    q: str = Query(..., min_length=1, max_length=100, description="搜尋關鍵字"),
    scope: str = Query("all", pattern="^(all|user|assistant)$"),
    date: str = Query("all", pattern="^(all|today|week|month)$"),
    limit: int = Query(20, ge=1, le=50),
    db: aiosqlite.Connection = Depends(db_dep),
    _: str = Depends(get_current_user),
):
    # FTS5 query：對特殊字元做基本跳脫，避免 syntax error
    safe_q = q.replace('"', '""')

    # 組 WHERE 條件
    conditions = []
    params: list = [f'"{safe_q}"']   # FTS5 phrase match

    if scope != "all":
        conditions.append("fts.role = ?")
        params.append(scope)

    cutoff = _date_cutoff(date)
    if cutoff:
        conditions.append("fts.created_at >= ?")
        params.append(cutoff)

    where_clause = f"AND {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)

    sql = f"""
        SELECT
            m.id          AS message_id,
            m.conversation_id,
            c.title       AS conversation_title,
            fts.role,
            highlight(messages_fts, 0, '{_HL_START}', '{_HL_END}') AS snippet,
            fts.created_at
        FROM messages_fts fts
        JOIN messages     m ON m.rowid = fts.rowid
        JOIN conversations c ON c.id = fts.conversation_id
        WHERE messages_fts MATCH ?
        {where_clause}
        ORDER BY rank
        LIMIT ?
    """

    try:
        async with db.execute(sql, params) as cur:
            rows = await cur.fetchall()
    except Exception as e:
        logger.error("FTS5 search error: %s | q=%r", e, q)
        raise HTTPException(status_code=400, detail="搜尋語法錯誤，請簡化關鍵字後再試")

    return [
        SearchResult(
            message_id=row["message_id"],
            conversation_id=row["conversation_id"],
            conversation_title=row["conversation_title"],
            role=row["role"],
            snippet=row["snippet"] or "",
            created_at=row["created_at"],
        )
        for row in rows
    ]
