"""
test_file_service.py — 測試檔案解析服務
"""
import io
import csv
import pytest
import sys
import os

# 確保 src/ 在路徑上
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.file_service import extract_text


# ─── TXT / MD ────────────────────────────────────────────────────────────────

def test_extract_txt_utf8():
    content = "Hello 你好".encode("utf-8")
    result = extract_text("test.txt", content)
    assert "Hello" in result
    assert "你好" in result


def test_extract_md():
    content = "# 標題\n\n這是 Markdown 內容。".encode("utf-8")
    result = extract_text("test.md", content)
    assert "標題" in result
    assert "Markdown" in result


def test_extract_txt_big5():
    content = "你好世界".encode("big5")
    result = extract_text("test.txt", content)
    assert "你好世界" in result


# ─── CSV ─────────────────────────────────────────────────────────────────────

def test_extract_csv_basic():
    csv_content = "姓名,年齡,城市\n王小明,25,台北\n李美麗,30,高雄\n"
    content = csv_content.encode("utf-8")
    result = extract_text("data.csv", content)
    assert "姓名" in result
    assert "王小明" in result
    assert "2 筆" in result


def test_extract_csv_empty():
    content = b""
    result = extract_text("empty.csv", content)
    assert result == ""


# ─── 格式檢查 ─────────────────────────────────────────────────────────────────

def test_unsupported_format_raises():
    with pytest.raises(ValueError, match="不支援的檔案格式"):
        extract_text("test.xlsx", b"content")


def test_unsupported_doc_raises():
    with pytest.raises(ValueError, match="不支援的檔案格式"):
        extract_text("test.doc", b"content")


# ─── 大小與截斷 ───────────────────────────────────────────────────────────────

def test_file_too_large_raises():
    big_content = b"x" * (11 * 1024 * 1024)  # 11MB
    with pytest.raises(ValueError, match="超過"):
        extract_text("test.txt", big_content)


def test_extract_txt_truncates_long_content():
    long_content = ("A" * 25000).encode("utf-8")
    result = extract_text("test.txt", long_content)
    assert len(result) <= 20000
