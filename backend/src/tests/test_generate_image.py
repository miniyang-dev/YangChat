"""
test_generate_image.py — Unit tests for generate_image() and POST /api/generate-image
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ─── generate_image() 函式測試 ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_image_success():
    """mock httpx 回傳含 inlineData 的 response，應回傳 data:image/jpeg;base64,... URL"""
    fake_b64 = "aGVsbG93b3JsZA=="  # base64("helloworld")
    fake_response_json = {
        "candidates": [{
            "content": {
                "parts": [
                    {"text": "Here is the image"},
                    {"inlineData": {"mimeType": "image/jpeg", "data": fake_b64}}
                ]
            }
        }]
    }

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = fake_response_json

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("src.services.file_service.httpx.AsyncClient", return_value=mock_client):
        from src.services.file_service import generate_image
        result = await generate_image("a cute cat", "fake-api-key")

    assert result == f"data:image/jpeg;base64,{fake_b64}"


@pytest.mark.asyncio
async def test_generate_image_no_image_in_response():
    """mock 回傳無 inlineData 的 response，應 raise ValueError"""
    fake_response_json = {
        "candidates": [{
            "content": {
                "parts": [
                    {"text": "I cannot generate an image for that prompt."}
                ]
            }
        }]
    }

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = fake_response_json

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("src.services.file_service.httpx.AsyncClient", return_value=mock_client):
        from src.services.file_service import generate_image
        with pytest.raises(ValueError, match="Gemini 未回傳圖片"):
            await generate_image("some prompt", "fake-api-key")


@pytest.mark.asyncio
async def test_generate_image_http_error():
    """mock httpx raise HTTPStatusError，應向上傳遞 exception"""
    import httpx as _httpx

    http_error = _httpx.HTTPStatusError(
        "500 Internal Server Error",
        request=MagicMock(),
        response=MagicMock(status_code=500),
    )

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock(side_effect=http_error)

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("src.services.file_service.httpx.AsyncClient", return_value=mock_client):
        from src.services.file_service import generate_image
        with pytest.raises(_httpx.HTTPStatusError):
            await generate_image("a landscape", "fake-api-key")


# ─── POST /api/generate-image endpoint 測試 ──────────────────────────────────

def test_generate_image_endpoint_requires_auth(client):
    """未帶 Authorization token 應回 401"""
    resp = client.post("/api/generate-image", json={"prompt": "a blue sky"})
    assert resp.status_code == 401


def test_generate_image_endpoint_success(client, auth_token):
    """mock generate_image 回傳 data URL，response 應含 image_url 和 success=True"""
    fake_data_url = "data:image/jpeg;base64,aGVsbG93b3JsZA=="

    with patch("src.api.upload.generate_image", new=AsyncMock(return_value=fake_data_url)):
        with patch("src.api.upload.settings") as mock_settings:
            mock_settings.GEMINI_API_KEY = "fake-gemini-key"
            resp = client.post(
                "/api/generate-image",
                json={"prompt": "a beautiful sunset"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )

    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["image_url"] == fake_data_url
    assert data["prompt"] == "a beautiful sunset"


def test_generate_image_endpoint_empty_prompt(client, auth_token):
    """prompt 為空字串，應回 422（Pydantic min_length=1 校驗失敗）"""
    resp = client.post(
        "/api/generate-image",
        json={"prompt": ""},
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert resp.status_code == 422


def test_generate_image_endpoint_gemini_error(client, auth_token):
    """mock generate_image raise ValueError，endpoint 應回 400"""
    with patch(
        "src.api.upload.generate_image",
        new=AsyncMock(side_effect=ValueError("Gemini 未回傳圖片，請修改 prompt 後重試")),
    ):
        with patch("src.api.upload.settings") as mock_settings:
            mock_settings.GEMINI_API_KEY = "fake-gemini-key"
            resp = client.post(
                "/api/generate-image",
                json={"prompt": "inappropriate content"},
                headers={"Authorization": f"Bearer {auth_token}"},
            )

    assert resp.status_code == 400
    assert "Gemini" in resp.json()["detail"]
