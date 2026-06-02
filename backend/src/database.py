import aiosqlite
from contextlib import asynccontextmanager
from pathlib import Path
from src.config import settings


# W3: asynccontextmanager 版本，確保連線一定被關閉
@asynccontextmanager
async def get_db_ctx():
    """Async context manager — 確保連線一定被關閉，防止洩漏"""
    db = await aiosqlite.connect(settings.DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    try:
        yield db
    finally:
        await db.close()


async def get_db() -> aiosqlite.Connection:
    """FastAPI Depends 用的裸連線版本（deps.py 的 db_dep 負責關閉）"""
    db = await aiosqlite.connect(settings.DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db():
    Path(settings.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(settings.DB_PATH) as db:
        await db.execute("PRAGMA foreign_keys=ON")
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                model TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL
                    REFERENCES conversations(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                images TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_messages_conv
                ON messages(conversation_id);
        """)
        await db.commit()
