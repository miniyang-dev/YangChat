"""
測試 web_search fallback 機制：
  - Tavily 正常 → 回傳 Tavily 結果
  - Tavily 429（額度耗盡）→ fallback 到 Exa
  - Tavily 401（key 無效）→ fallback 到 Exa
  - Tavily 任意 Exception → fallback 到 Exa
  - Exa 也失敗 → 回傳錯誤訊息（不 crash）
  - _execute_tool 整合：正常 / fallback 路徑
"""
import json
import pytest
import httpx
from unittest.mock import AsyncMock, patch, MagicMock

from src.services.ai_service import (
    _tavily_search,
    _exa_search,
    _execute_tool,
    _TavilyQuotaError,
)


# ── _tavily_search ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tavily_success():
    """Tavily 正常回傳 → 回傳格式化文字"""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status = MagicMock()
    mock_resp.json.return_value = {
        "answer": "今天晴天",
        "results": [
            {"title": "天氣報導", "url": "https://example.com", "content": "台北今日晴"},
        ],
    }

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_resp)

    with patch("src.services.ai_service.settings") as s, \
         patch("src.services.ai_service.httpx.AsyncClient", return_value=mock_client):
        s.TAVILY_API_KEY = "tvly-test"
        result = await _tavily_search("台北天氣")

    assert "今天晴天" in result
    assert "天氣報導" in result
    assert "https://example.com" in result


@pytest.mark.asyncio
async def test_tavily_429_raises_quota_error():
    """Tavily 429 → 拋出 _TavilyQuotaError"""
    mock_resp = MagicMock()
    mock_resp.status_code = 429

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_resp)

    with patch("src.services.ai_service.settings") as s, \
         patch("src.services.ai_service.httpx.AsyncClient", return_value=mock_client):
        s.TAVILY_API_KEY = "tvly-test"
        with pytest.raises(_TavilyQuotaError):
            await _tavily_search("test")


@pytest.mark.asyncio
async def test_tavily_401_raises_quota_error():
    """Tavily 401 → 拋出 _TavilyQuotaError"""
    mock_resp = MagicMock()
    mock_resp.status_code = 401

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_resp)

    with patch("src.services.ai_service.settings") as s, \
         patch("src.services.ai_service.httpx.AsyncClient", return_value=mock_client):
        s.TAVILY_API_KEY = "tvly-test"
        with pytest.raises(_TavilyQuotaError):
            await _tavily_search("test")


@pytest.mark.asyncio
async def test_tavily_no_key_raises_quota_error():
    """TAVILY_API_KEY 未設定 → 拋出 _TavilyQuotaError"""
    with patch("src.services.ai_service.settings") as s:
        s.TAVILY_API_KEY = ""
        with pytest.raises(_TavilyQuotaError):
            await _tavily_search("test")


# ── _exa_search ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_exa_success():
    """Exa 正常回傳 → 回傳格式化文字"""
    mock_resp = MagicMock()
    mock_resp.is_success = True
    mock_resp.json.return_value = {
        "results": [
            {"title": "Exa 結果", "url": "https://exa.com/1", "text": "這是 Exa 搜到的內容"},
        ],
    }

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_resp)

    with patch("src.services.ai_service.settings") as s, \
         patch("src.services.ai_service.httpx.AsyncClient", return_value=mock_client):
        s.EXA_API_KEY = "exa-test"
        result = await _exa_search("test query")

    assert "Exa 結果" in result
    assert "https://exa.com/1" in result


@pytest.mark.asyncio
async def test_exa_http_error_returns_message():
    """Exa API 失敗 → 回傳錯誤訊息字串（不 crash）"""
    mock_resp = MagicMock()
    mock_resp.is_success = False
    mock_resp.status_code = 500

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=mock_resp)

    with patch("src.services.ai_service.settings") as s, \
         patch("src.services.ai_service.httpx.AsyncClient", return_value=mock_client):
        s.EXA_API_KEY = "exa-test"
        result = await _exa_search("test")

    assert "HTTP 500" in result


@pytest.mark.asyncio
async def test_exa_no_key_returns_message():
    """EXA_API_KEY 未設定 → 回傳提示訊息"""
    with patch("src.services.ai_service.settings") as s:
        s.EXA_API_KEY = ""
        result = await _exa_search("test")
    assert "Exa API key 未設定" in result


# ── _execute_tool fallback 整合 ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_execute_tool_tavily_ok():
    """正常情況：使用 Tavily，不觸發 fallback"""
    with patch("src.services.ai_service._tavily_search", new_callable=AsyncMock) as mock_tavily, \
         patch("src.services.ai_service._exa_search", new_callable=AsyncMock) as mock_exa:
        mock_tavily.return_value = "Tavily 結果"
        result = await _execute_tool("web_search", '{"query": "test"}')

    assert result == "Tavily 結果"
    mock_exa.assert_not_called()


@pytest.mark.asyncio
async def test_execute_tool_fallback_on_quota_error():
    """Tavily 拋 _TavilyQuotaError → 自動切換 Exa"""
    with patch("src.services.ai_service._tavily_search", new_callable=AsyncMock) as mock_tavily, \
         patch("src.services.ai_service._exa_search", new_callable=AsyncMock) as mock_exa:
        mock_tavily.side_effect = _TavilyQuotaError("429")
        mock_exa.return_value = "Exa 結果"
        result = await _execute_tool("web_search", '{"query": "test"}')

    assert result == "Exa 結果"
    mock_exa.assert_called_once_with("test")


@pytest.mark.asyncio
async def test_execute_tool_fallback_on_generic_exception():
    """Tavily 拋任意 Exception（如 timeout）→ fallback Exa"""
    with patch("src.services.ai_service._tavily_search", new_callable=AsyncMock) as mock_tavily, \
         patch("src.services.ai_service._exa_search", new_callable=AsyncMock) as mock_exa:
        mock_tavily.side_effect = httpx.TimeoutException("timeout")
        mock_exa.return_value = "Exa fallback"
        result = await _execute_tool("web_search", '{"query": "天氣"}')

    assert result == "Exa fallback"
    mock_exa.assert_called_once_with("天氣")


@pytest.mark.asyncio
async def test_execute_tool_both_fail_returns_message():
    """Tavily + Exa 都失敗 → 回傳錯誤訊息，不 crash"""
    with patch("src.services.ai_service._tavily_search", new_callable=AsyncMock) as mock_tavily, \
         patch("src.services.ai_service._exa_search", new_callable=AsyncMock) as mock_exa:
        mock_tavily.side_effect = _TavilyQuotaError("429")
        mock_exa.return_value = "（搜尋失敗：Tavily 已耗盡，Exa 回傳 HTTP 500）"
        result = await _execute_tool("web_search", '{"query": "test"}')

    assert "失敗" in result


@pytest.mark.asyncio
async def test_execute_tool_invalid_json():
    """arguments JSON 格式錯誤 → 回傳解析失敗訊息"""
    result = await _execute_tool("web_search", "not-json")
    assert "解析失敗" in result


@pytest.mark.asyncio
async def test_execute_tool_unknown_tool():
    """未知工具 → 回傳提示"""
    result = await _execute_tool("unknown_tool", '{}')
    assert "未知工具" in result
