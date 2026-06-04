"""
Billing proxy — 從 Pioneer AI /billing/billing-status 取得用量，
對前端暴露 GET /api/billing/usage（不洩漏 Pioneer API key）。
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from src.api.deps import get_current_user
from src.config import settings

router = APIRouter()

PIONEER_BILLING_URL = "https://api.pioneer.ai/billing/billing-status"
PIONEER_PLAN_URL = "https://api.pioneer.ai/billing/plan-info"


class UsageResponse(BaseModel):
    # token 用量
    tokens_used: int
    tokens_limit: int
    tokens_remaining: int
    usage_pct: float          # 0.0 ~ 1.0
    # 方案資訊
    plan_name: str
    has_payment: bool


@router.get("/billing/usage", response_model=UsageResponse)
async def get_billing_usage(_: str = Depends(get_current_user)):
    """
    Proxy Pioneer /billing/billing-status + /billing/plan-info，
    合併回傳前端所需欄位。
    """
    key = settings.PIONEER_API_KEY
    if not key:
        raise HTTPException(status_code=503, detail="PIONEER_API_KEY 未設定")

    auth_headers = {"Authorization": f"Bearer {key}"}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            status_res, plan_res = await _fetch_both(client, auth_headers)
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Pioneer API 請求逾時")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Pioneer API 錯誤: {e}")

    # billing-status 欄位
    total_used: int = status_res.get("total_token_usage", 0)
    free_remaining: int = status_res.get("free_tier_remaining_tokens", 0)
    has_payment: bool = bool(status_res.get("has_payment_method", False))

    # plan-info 欄位
    plan_name: str = plan_res.get("plan_name") or plan_res.get("plan", "Hobby")
    token_limit: int = (
        plan_res.get("token_limit")
        or plan_res.get("credits_limit")
        or plan_res.get("monthly_token_limit")
        or 0
    )

    # fallback：若 plan-info 沒給 limit，用 billing-status 推算
    if token_limit == 0 and free_remaining >= 0:
        token_limit = total_used + free_remaining

    tokens_remaining = max(0, token_limit - total_used)
    usage_pct = (total_used / token_limit) if token_limit > 0 else 0.0

    return UsageResponse(
        tokens_used=total_used,
        tokens_limit=token_limit,
        tokens_remaining=tokens_remaining,
        usage_pct=round(min(usage_pct, 1.0), 4),
        plan_name=plan_name,
        has_payment=has_payment,
    )


async def _fetch_both(client: httpx.AsyncClient, headers: dict):
    """並行呼叫兩個 Pioneer endpoint。"""
    import asyncio
    status_task = client.get(PIONEER_BILLING_URL, headers=headers)
    plan_task = client.get(PIONEER_PLAN_URL, headers=headers)
    status_r, plan_r = await asyncio.gather(status_task, plan_task)

    if status_r.status_code != 200:
        raise httpx.HTTPError(f"billing-status HTTP {status_r.status_code}")
    if plan_r.status_code != 200:
        raise httpx.HTTPError(f"plan-info HTTP {plan_r.status_code}")

    return status_r.json(), plan_r.json()
