"""
Billing proxy — 從 Pioneer AI /billing/plan-info 取得 credit 用量，
對前端暴露 GET /api/billing/usage（不洩漏 Pioneer API key）。

Pioneer 實際 API 欄位（2026-06）：
  /billing/plan-info:
    payment_plan       str   e.g. "pro_legacy"
    credit_limit       float e.g. 10000.0  (帳戶累計上限 $USD)
    total_usage        float e.g. 5457.12  (帳戶累計已用，非每日)
    remaining_credits  float e.g. 4542.88  (帳戶剩餘)

注意：Pioneer 官網另有「每日 $100 免費額度」的 UI 顯示，
但 /billing/plan-info 只提供帳戶累計數字，沒有每日用量欄位。
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from src.api.deps import get_current_user
from src.config import settings

router = APIRouter()

PIONEER_PLAN_URL = "https://api.pioneer.ai/billing/plan-info"

# 方案 ID → 顯示名稱
_PLAN_DISPLAY = {
    "pro_legacy":  "Pro",
    "pro":         "Pro",
    "hobby":       "Hobby",
    "team":        "Team",
    "enterprise":  "Enterprise",
}


class UsageResponse(BaseModel):
    credits_used: float       # 已用額度
    credits_limit: float      # 總額度上限
    credits_remaining: float  # 剩餘
    usage_pct: float          # 0.0 ~ 1.0
    plan_name: str            # 顯示用方案名稱
    has_payment: bool


@router.get("/billing/usage", response_model=UsageResponse)
async def get_billing_usage(_: str = Depends(get_current_user)):
    """
    Proxy Pioneer /billing/plan-info，回傳前端所需 credit 用量。
    """
    key = settings.PIONEER_API_KEY
    if not key:
        raise HTTPException(status_code=503, detail="PIONEER_API_KEY 未設定")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                PIONEER_PLAN_URL,
                headers={"Authorization": f"Bearer {key}"},
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Pioneer API 請求逾時")
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Pioneer API 錯誤: {e}")

    if r.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Pioneer plan-info 回傳 HTTP {r.status_code}",
        )

    data = r.json()

    credits_used: float      = float(data.get("total_usage", 0) or 0)
    credits_limit: float     = float(data.get("credit_limit", 0) or 0)
    credits_remaining: float = float(data.get("remaining_credits", 0) or 0)
    payment_plan: str        = data.get("payment_plan", "") or ""
    has_payment: bool        = bool(data.get("has_payment_method", True))

    # fallback：plan-info 不給 has_payment，用 credit_limit > 0 推斷
    if credits_limit > 0:
        has_payment = True

    # 若 remaining 沒給，自己算
    if credits_remaining == 0 and credits_limit > 0:
        credits_remaining = max(0.0, credits_limit - credits_used)

    usage_pct = (credits_used / credits_limit) if credits_limit > 0 else 0.0

    plan_name = _PLAN_DISPLAY.get(payment_plan.lower(), payment_plan or "Hobby")

    return UsageResponse(
        credits_used=round(credits_used, 2),
        credits_limit=round(credits_limit, 2),
        credits_remaining=round(credits_remaining, 2),
        usage_pct=round(min(usage_pct, 1.0), 4),
        plan_name=plan_name,
        has_payment=has_payment,
    )
