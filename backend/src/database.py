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
                system_prompt TEXT NOT NULL DEFAULT '',
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

            -- FTS5 全文搜尋虛擬表（content= 外部內容模式，不重複儲存資料）
            CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
                USING fts5(
                    content,
                    conversation_id UNINDEXED,
                    role UNINDEXED,
                    created_at UNINDEXED,
                    content='messages',
                    content_rowid='rowid',
                    tokenize='unicode61'
                );

            -- INSERT trigger：新訊息自動同步到 FTS
            CREATE TRIGGER IF NOT EXISTS messages_ai
                AFTER INSERT ON messages BEGIN
                    INSERT INTO messages_fts(rowid, content, conversation_id, role, created_at)
                    VALUES (new.rowid, new.content, new.conversation_id, new.role, new.created_at);
                END;

            -- DELETE trigger：刪除訊息時同步 FTS
            CREATE TRIGGER IF NOT EXISTS messages_ad
                AFTER DELETE ON messages BEGIN
                    INSERT INTO messages_fts(messages_fts, rowid, content, conversation_id, role, created_at)
                    VALUES ('delete', old.rowid, old.content, old.conversation_id, old.role, old.created_at);
                END;

            -- UPDATE trigger：更新訊息時同步 FTS
            CREATE TRIGGER IF NOT EXISTS messages_au
                AFTER UPDATE ON messages BEGIN
                    INSERT INTO messages_fts(messages_fts, rowid, content, conversation_id, role, created_at)
                    VALUES ('delete', old.rowid, old.content, old.conversation_id, old.role, old.created_at);
                    INSERT INTO messages_fts(rowid, content, conversation_id, role, created_at)
                    VALUES (new.rowid, new.content, new.conversation_id, new.role, new.created_at);
                END;
        """)
        # Migration：為舊 DB 補 system_prompt 欄位（若已存在則忽略）
        try:
            await db.execute("ALTER TABLE conversations ADD COLUMN system_prompt TEXT NOT NULL DEFAULT ''")
            await db.commit()
        except Exception:
            pass  # 欄位已存在，忽略
