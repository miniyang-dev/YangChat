from fastapi import APIRouter, Depends
from src.api.deps import get_current_user
from src.services.ai_service import AVAILABLE_MODELS
from src.models.schemas import ModelInfo, ModelsResponse

router = APIRouter(tags=["models"])


@router.get("", response_model=ModelsResponse)
async def list_models(_: str = Depends(get_current_user)):
    return ModelsResponse(
        success=True,
        data=[ModelInfo(**m) for m in AVAILABLE_MODELS]
    )
