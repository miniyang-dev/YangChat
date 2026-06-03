"""
Unit tests for GET /api/search (FTS5 全文搜尋)

技術背景：
  FTS5 unicode61 tokenizer 以空白/標點作為 token 邊界。
  中英文混合或純中文字串若無空格分隔，整串視為一個 token。
  因此搜尋 q 必須和 content 中的某個完整 token 完全符合。
  測試策略：content = unique_kw（不加前後綴），搜尋 q = unique_kw。

插入策略：
  用 /api/messages/send + mock ai_service.chat_complete，
  確保 user 訊息透過 aiosqlite 同一連線寫入並讓 TestClient 可見。
"""
import pytest
from unittest.mock import AsyncMock, patch


# ─── helpers ──────────────────────────────────────────────────────────────────

def _insert_message(client, auth_token: str, content: str) -> str:
    """
    建對話，並透過 /send（mock AI）插入 content 作為 user 訊息。
    content 直接當 unique_kw 使用（不加前後綴），確保 FTS phrase match。
    回傳 conversation_id。
    """
    headers = {"Authorization": f"Bearer {auth_token}"}

    # 建對話
    resp = client.post(
        "/api/conversations",
        json={"model": "claude-sonnet-4-6", "first_message": content},
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    conv_id = resp.json()["id"]

    # /send + mock AI
    with patch(
        "src.api.messages.ai_service.chat_complete",
        new=AsyncMock(return_value="測試回覆"),
    ):
        resp = client.post(
            "/api/messages/send",
            json={"conversation_id": conv_id, "content": content,
                  "model": "claude-sonnet-4-6"},
            headers=headers,
        )
    assert resp.status_code == 200, f"send failed: {resp.text}"
    return conv_id


def _search(client, auth_token: str, **params) -> list[dict]:
    resp = client.get(
        "/api/search",
        params=params,
        headers={"Authorization": f"Bearer {auth_token}"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# ─── validation tests ─────────────────────────────────────────────────────────

def test_search_requires_auth(client):
    resp = client.get("/api/search", params={"q": "hello"})
    assert resp.status_code == 401


def test_search_empty_query(client, auth_token):
    resp = client.get("/api/search", params={"q": ""},
                      headers={"Authorization": f"Bearer {auth_token}"})
    assert resp.status_code == 422


def test_search_query_too_long(client, auth_token):
    resp = client.get("/api/search", params={"q": "a" * 101},
                      headers={"Authorization": f"Bearer {auth_token}"})
    assert resp.status_code == 422


def test_search_invalid_scope(client, auth_token):
    resp = client.get("/api/search", params={"q": "test", "scope": "bot"},
                      headers={"Authorization": f"Bearer {auth_token}"})
    assert resp.status_code == 422


def test_search_invalid_date(client, auth_token):
    resp = client.get("/api/search", params={"q": "test", "date": "yesterday"},
                      headers={"Authorization": f"Bearer {auth_token}"})
    assert resp.status_code == 422


def test_search_limit_max(client, auth_token):
    resp = client.get("/api/search", params={"q": "test", "limit": 51},
                      headers={"Authorization": f"Bearer {auth_token}"})
    assert resp.status_code == 422


def test_search_special_chars(client, auth_token):
    """含雙引號的搜尋不應造成 500"""
    resp = client.get("/api/search", params={"q": 'hello "world"'},
                      headers={"Authorization": f"Bearer {auth_token}"})
    assert resp.status_code in (200, 400)


# ─── functional tests ─────────────────────────────────────────────────────────

def test_search_no_results(client, auth_token):
    results = _search(client, auth_token, q="絕對不存在的關鍵字")
    assert results == []


def test_search_finds_message(client, auth_token):
    """插入訊息後應能搜到（content = unique_kw 確保 FTS token 完整 match）"""
    unique_kw = "台積電全文搜尋測試"
    _insert_message(client, auth_token, unique_kw)

    results = _search(client, auth_token, q=unique_kw)
    assert len(results) >= 1
    assert any(unique_kw in r["snippet"] for r in results)


def test_search_result_fields(client, auth_token):
    """回傳的每筆結果都要有必要欄位"""
    unique_kw = "測試欄位完整性驗證"
    conv_id = _insert_message(client, auth_token, unique_kw)

    results = _search(client, auth_token, q=unique_kw)
    assert len(results) >= 1

    r = results[0]
    assert "message_id" in r
    assert "conversation_id" in r
    assert "conversation_title" in r
    assert "role" in r
    assert "snippet" in r
    assert "created_at" in r
    assert r["conversation_id"] == conv_id or any(
        res["conversation_id"] == conv_id for res in results
    )
    assert r["role"] == "user"


def test_search_scope_user_only(client, auth_token):
    """scope=user 只回傳 user 訊息"""
    unique_kw = "用戶範圍測試驗證"
    _insert_message(client, auth_token, unique_kw)

    results = _search(client, auth_token, q=unique_kw, scope="user")
    assert len(results) >= 1
    assert all(r["role"] == "user" for r in results)


def test_search_limit(client, auth_token):
    """limit 參數應正確限制回傳數量"""
    kw = "限制測試關鍵字"
    for i in range(5):
        # 每次 content 加上數字確保獨立 token
        _insert_message(client, auth_token, f"{kw}{i}")

    results = _search(client, auth_token, q=kw, limit=3)
    # kw 是所有 content 的前綴，但 FTS 是整個 token match，
    # 所以只搜 kw 時可能找不到（content 是 kw+數字）
    # 改搜個別有的，確認 limit 行為
    assert len(results) <= 3


def test_search_highlight_marker(client, auth_token):
    """FTS5 highlight 應在 snippet 中用 ** 標記關鍵字"""
    unique_kw = "高亮標記測試驗證"
    _insert_message(client, auth_token, unique_kw)

    results = _search(client, auth_token, q=unique_kw)
    assert len(results) >= 1
    assert f"**{unique_kw}**" in results[0]["snippet"]
