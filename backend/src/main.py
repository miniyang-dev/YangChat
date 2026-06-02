from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from src.database import init_db
from src.api import auth, conversations, messages, models
from src.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="YangChat API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,          prefix="/api/auth")
app.include_router(conversations.router, prefix="/api/conversations")
app.include_router(messages.router,      prefix="/api/messages")
app.include_router(models.router,        prefix="/api/models")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "YangChat"}
