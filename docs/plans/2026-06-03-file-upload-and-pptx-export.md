# YangChat 檔案上傳 & PowerPoint 產出 實作計畫

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 讓使用者可以在對話中上傳 PDF / PPTX / TXT / DOCX / MD / CSV 檔案作為 AI 的輸入 context，並能讓 AI 根據需求產出 PowerPoint (.pptx) 檔案供下載。

**Architecture:**
- 後端新增 `file_service.py` 負責檔案解析（PDF/PPTX/TXT/DOCX/MD/CSV → 純文字）
- 後端新增 `export_service.py` 負責 AI 內容 → PPTX 組裝
- 後端新增 `upload.py` API router（`POST /api/upload`）
- 後端在 `messages.py` 擴充支援帶 file_context 的訊息
- 前端新增上傳按鈕 + 下載按鈕 UI

**Tech Stack:**
- 後端：`pymupdf`（PDF）、`python-pptx`（PPTX）、`python-docx`（DOCX）、內建 `csv` 模組（CSV）
- 前端：React + TypeScript，已有 Tailwind CSS

**Branch:** `feat/file-upload-pptx-export`

---

## Phase 1：後端基礎建設

### Task 1：新增 Python 套件依賴

**Objective:** 將 `pymupdf` 和 `python-pptx` 加入 requirements.txt

**Files:**
- Modify: `backend/requirements.txt`

**Step 1：新增套件**

```
pymupdf==1.24.5
python-pptx==1.0.2
```

加到 `backend/requirements.txt` 末尾。

**Step 2：本地安裝確認**

```bash
cd backend
pip install pymupdf==1.24.5 python-pptx==1.0.2
python -c "import fitz; import pptx; print('OK')"
```
Expected: `OK`

**Step 3：Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: add pymupdf and python-pptx dependencies"
```

---

### Task 2：建立 file_service.py（檔案解析服務）

**Objective:** 將 PDF / PPTX / TXT 解析為純文字字串，供後續塞入 AI context

**Files:**
- Create: `backend/src/services/file_service.py`

**Step 1：建立服務檔案**

```python
"""
file_service.py — 解析上傳檔案為純文字
支援格式：PDF (.pdf), PowerPoint (.pptx), 純文字 (.txt)
"""
import io
from pathlib import Path

import fitz  # pymupdf
from pptx import Presentation


MAX_FILE_SIZE_MB = 10
MAX_CHARS = 20000  # 避免塞爆 context window


def extract_text(filename: str, content: bytes) -> str:
    """
    根據副檔名選擇對應解析器，回傳純文字（最多 MAX_CHARS 字元）。
    不支援的格式拋出 ValueError。
    """
    suffix = Path(filename).suffix.lower()

    if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise ValueError(f"檔案超過 {MAX_FILE_SIZE_MB}MB 限制")

    if suffix == ".txt":
        text = _extract_txt(content)
    elif suffix == ".pdf":
        text = _extract_pdf(content)
    elif suffix == ".pptx":
        text = _extract_pptx(content)
    else:
        raise ValueError(f"不支援的檔案格式：{suffix}，請上傳 PDF、PPTX 或 TXT")

    return text[:MAX_CHARS]


def _extract_txt(content: bytes) -> str:
    """嘗試 UTF-8，失敗則 fallback 到 big5"""
    try:
        return content.decode("utf-8")
    except UnicodeDecodeError:
        return content.decode("big5", errors="replace")


def _extract_pdf(content: bytes) -> str:
    """用 pymupdf 逐頁提取文字"""
    doc = fitz.open(stream=content, filetype="pdf")
    pages = []
    for i, page in enumerate(doc):
        text = page.get_text().strip()
        if text:
            pages.append(f"[第 {i+1} 頁]\n{text}")
    doc.close()
    return "\n\n".join(pages)


def _extract_pptx(content: bytes) -> str:
    """用 python-pptx 逐張投影片提取文字"""
    prs = Presentation(io.BytesIO(content))
    slides = []
    for i, slide in enumerate(prs.slides):
        texts = []
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    line = para.text.strip()
                    if line:
                        texts.append(line)
        if texts:
            slides.append(f"[投影片 {i+1}]\n" + "\n".join(texts))
    return "\n\n".join(slides)
```

**Step 2：寫測試**

建立 `backend/src/tests/test_file_service.py`：

```python
import pytest
from services.file_service import extract_text


def test_extract_txt_utf8():
    content = "Hello 你好".encode("utf-8")
    result = extract_text("test.txt", content)
    assert "Hello" in result
    assert "你好" in result


def test_unsupported_format_raises():
    with pytest.raises(ValueError, match="不支援的檔案格式"):
        extract_text("test.docx", b"content")


def test_file_too_large_raises():
    big_content = b"x" * (11 * 1024 * 1024)  # 11MB
    with pytest.raises(ValueError, match="超過"):
        extract_text("test.txt", big_content)


def test_extract_txt_truncates_long_content():
    long_content = ("A" * 25000).encode("utf-8")
    result = extract_text("test.txt", long_content)
    assert len(result) <= 20000
```

```bash
cd backend
pytest src/tests/test_file_service.py -v
```
Expected: 4 passed

**Step 3：Commit**

```bash
git add backend/src/services/file_service.py backend/src/tests/test_file_service.py
git commit -m "feat: add file_service for PDF/PPTX/TXT text extraction"
```

---

### Task 3：建立 export_service.py（PPTX 產出服務）

**Objective:** 接收 AI 回傳的投影片結構（JSON），組裝成 .pptx 並回傳 bytes

**Files:**
- Create: `backend/src/services/export_service.py`

**Step 1：建立服務檔案**

```python
"""
export_service.py — 將 AI 產出的投影片結構組裝成 .pptx
"""
import io
from typing import List
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor


def build_pptx(slides_data: List[dict]) -> bytes:
    """
    輸入格式：
    [
        {"title": "投影片標題", "content": ["重點1", "重點2", ...]},
        ...
    ]
    回傳：.pptx 的 bytes
    """
    prs = Presentation()
    # 使用空白 layout（index 6）
    blank_layout = prs.slide_layouts[6]
    title_only_layout = prs.slide_layouts[5]

    for slide_data in slides_data:
        slide = prs.slides.add_slide(title_only_layout)

        # 標題
        title_box = slide.shapes.title
        title_box.text = slide_data.get("title", "")
        title_box.text_frame.paragraphs[0].font.size = Pt(28)
        title_box.text_frame.paragraphs[0].font.bold = True

        # 內容文字框
        content_lines = slide_data.get("content", [])
        if content_lines:
            txBox = slide.shapes.add_textbox(
                Inches(0.5), Inches(1.8), Inches(9), Inches(5)
            )
            tf = txBox.text_frame
            tf.word_wrap = True
            for i, line in enumerate(content_lines):
                if i == 0:
                    p = tf.paragraphs[0]
                else:
                    p = tf.add_paragraph()
                p.text = f"• {line}"
                p.font.size = Pt(18)

    output = io.BytesIO()
    prs.save(output)
    return output.getvalue()
```

**Step 2：寫測試**

```python
# backend/src/tests/test_export_service.py
from services.export_service import build_pptx
from pptx import Presentation
import io


def test_build_pptx_returns_bytes():
    slides = [{"title": "測試", "content": ["重點A", "重點B"]}]
    result = build_pptx(slides)
    assert isinstance(result, bytes)
    assert len(result) > 0


def test_build_pptx_correct_slide_count():
    slides = [
        {"title": "第一頁", "content": ["A"]},
        {"title": "第二頁", "content": ["B"]},
    ]
    result = build_pptx(slides)
    prs = Presentation(io.BytesIO(result))
    assert len(prs.slides) == 2


def test_build_pptx_empty_slides():
    result = build_pptx([])
    prs = Presentation(io.BytesIO(result))
    assert len(prs.slides) == 0
```

```bash
pytest src/tests/test_export_service.py -v
```
Expected: 3 passed

**Step 3：Commit**

```bash
git add backend/src/services/export_service.py backend/src/tests/test_export_service.py
git commit -m "feat: add export_service for AI-driven PPTX generation"
```

---

## Phase 2：後端 API 層

### Task 4：建立 upload.py API router

**Objective:** `POST /api/upload` 接收檔案，解析後回傳文字 excerpt 供前端顯示確認

**Files:**
- Create: `backend/src/api/upload.py`
- Modify: `backend/src/main.py`（掛載 router）

**Step 1：建立 upload.py**

```python
"""
upload.py — 檔案上傳 API
POST /api/upload  → 解析檔案，回傳文字摘要
"""
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from api.deps import get_current_user
from services.file_service import extract_text

router = APIRouter()


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    上傳 PDF / PPTX / TXT 檔案。
    回傳解析後的純文字（用於塞入 AI context）。
    """
    content = await file.read()

    try:
        text = extract_text(file.filename, content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    preview = text[:300] + "..." if len(text) > 300 else text

    return {
        "filename": file.filename,
        "char_count": len(text),
        "preview": preview,
        "full_text": text,  # 前端暫存，發訊息時附帶
    }
```

**Step 2：在 main.py 掛載 router**

在 `backend/src/main.py` 中，參照現有 router 的掛載方式，加上：

```python
from api.upload import router as upload_router
app.include_router(upload_router, prefix="/api", tags=["upload"])
```

**Step 3：手動測試**

```bash
# 啟動後端
cd backend/src && uvicorn main:app --reload --port 8000

# 測試（另開終端）
curl -X POST http://localhost:8000/api/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/test.txt"
```
Expected: JSON 含 `filename`, `char_count`, `preview`, `full_text`

**Step 4：Commit**

```bash
git add backend/src/api/upload.py backend/src/main.py
git commit -m "feat: add POST /api/upload endpoint for file text extraction"
```

---

### Task 5：建立 export.py API router（PPTX 產出）

**Objective:** `POST /api/export/pptx` 接收需求文字，讓 AI 產生投影片結構，組裝成 .pptx 回傳下載

**Files:**
- Create: `backend/src/api/export.py`
- Modify: `backend/src/main.py`（掛載 router）

**Step 1：建立 export.py**

```python
"""
export.py — AI 產出 PPTX API
POST /api/export/pptx → AI 產生投影片 JSON → 組裝 .pptx → 回傳下載
"""
import json
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from api.deps import get_current_user
from services.export_service import build_pptx
from services.ai_service import AIService

router = APIRouter()


class PptxRequest(BaseModel):
    prompt: str           # 使用者需求，例如「幫我做5頁關於AI的行銷簡報」
    slide_count: int = 5  # 投影片張數


SYSTEM_PROMPT = """你是一個簡報製作專家。
根據使用者需求，產出投影片結構，必須回傳合法 JSON，格式如下：
[
  {"title": "投影片標題", "content": ["重點1", "重點2", "重點3"]},
  ...
]
只回傳 JSON，不要任何說明文字。每張投影片 content 最多 5 個重點。"""


@router.post("/export/pptx")
async def export_pptx(
    req: PptxRequest,
    current_user: dict = Depends(get_current_user),
):
    ai = AIService()

    user_msg = f"請製作 {req.slide_count} 頁投影片，主題：{req.prompt}"

    # 呼叫 AI 取得投影片結構（非 streaming，直接等待完整回應）
    full_response = ""
    async for chunk in ai.stream_response(
        messages=[{"role": "user", "content": user_msg}],
        system_prompt=SYSTEM_PROMPT,
    ):
        full_response += chunk

    # 解析 JSON
    try:
        # 清理可能的 markdown code block 包裝
        clean = full_response.strip().strip("```json").strip("```").strip()
        slides_data = json.loads(clean)
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=500,
            detail="AI 回傳格式錯誤，請重試"
        )

    # 組裝 PPTX
    pptx_bytes = build_pptx(slides_data)

    filename = f"yangchat-export.pptx"
    return Response(
        content=pptx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

**Step 2：在 main.py 掛載**

```python
from api.export import router as export_router
app.include_router(export_router, prefix="/api", tags=["export"])
```

**Step 3：手動測試**

```bash
curl -X POST http://localhost:8000/api/export/pptx \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "台灣觀光景點介紹", "slide_count": 3}' \
  --output test.pptx

open test.pptx  # macOS 直接用 Keynote 開
```
Expected: 下載 .pptx，內含 3 張投影片

**Step 4：Commit**

```bash
git add backend/src/api/export.py backend/src/main.py
git commit -m "feat: add POST /api/export/pptx endpoint for AI-driven slide generation"
```

---

## Phase 3：前端 UI

### Task 6：前端新增上傳按鈕與 file context 狀態

**Objective:** 在輸入框旁新增迴紋針按鈕，上傳後顯示檔案名稱標籤，發送訊息時附帶 file_context

**Files:**
- Create: `frontend/src/components/FileUploadButton.tsx`
- Modify: `frontend/src/components/InputBar.tsx`（整合上傳按鈕）
- Modify: `frontend/src/services/api.ts`（新增 uploadFile 函式）

**Step 1：api.ts 新增 uploadFile**

```typescript
// 在既有 api.ts 末尾新增
export async function uploadFile(file: File, token: string) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || '上傳失敗')
  }
  return res.json() as Promise<{
    filename: string
    char_count: number
    preview: string
    full_text: string
  }>
}
```

**Step 2：建立 FileUploadButton.tsx**

```tsx
import { useRef } from 'react'

interface Props {
  onUpload: (filename: string, fullText: string) => void
  disabled?: boolean
}

export function FileUploadButton({ onUpload, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const token = localStorage.getItem('token') || ''
    try {
      const { uploadFile } = await import('../services/api')
      const result = await uploadFile(file, token)
      onUpload(result.filename, result.full_text)
    } catch (err: any) {
      alert(err.message)
    }

    // 清空 input 讓同一檔案可以重複上傳
    e.target.value = ''
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.pptx,.txt"
        className="hidden"
        onChange={handleChange}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="p-2 text-gray-400 hover:text-gray-200 transition-colors"
        title="上傳 PDF / PPTX / TXT"
      >
        📎
      </button>
    </>
  )
}
```

**Step 3：在 InputBar.tsx 整合**

- 在 InputBar state 中新增 `fileContext: { filename: string; text: string } | null`
- 引入 `FileUploadButton`，放在送出按鈕左側
- 若 `fileContext` 存在，顯示檔案名稱標籤（含 ✕ 移除按鈕）
- 發送訊息時，若有 `fileContext`，將文字以以下格式附加在使用者訊息前：
  ```
  [附加檔案：filename.pdf]
  <file_context>
  {full_text}
  </file_context>

  {使用者訊息}
  ```

**Step 4：前端啟動確認**

```bash
cd frontend && npm run dev
```
- 確認迴紋針按鈕出現
- 上傳 .txt 後，顯示檔案標籤
- 發送訊息後，AI 能針對檔案內容回答

**Step 5：Commit**

```bash
git add frontend/src/components/FileUploadButton.tsx \
        frontend/src/components/InputBar.tsx \
        frontend/src/services/api.ts
git commit -m "feat: add file upload button with context injection in InputBar"
```

---

### Task 7：前端新增「產出 PPTX」按鈕

**Objective:** 在工具列新增按鈕，點擊後輸入需求，自動產出並下載 .pptx

**Files:**
- Create: `frontend/src/components/ExportPptxButton.tsx`
- Modify: `frontend/src/services/api.ts`（新增 exportPptx 函式）

**Step 1：api.ts 新增 exportPptx**

```typescript
export async function exportPptx(
  prompt: string,
  slideCount: number,
  token: string
): Promise<void> {
  const res = await fetch('/api/export/pptx', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ prompt, slide_count: slideCount }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || '產出失敗')
  }

  // 觸發瀏覽器下載
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'yangchat-export.pptx'
  a.click()
  URL.revokeObjectURL(url)
}
```

**Step 2：建立 ExportPptxButton.tsx**

```tsx
import { useState } from 'react'

interface Props {
  token: string
}

export function ExportPptxButton({ token }: Props) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    const prompt = window.prompt('請輸入簡報主題與需求：', '例如：AI 趨勢介紹，5頁')
    if (!prompt) return

    setLoading(true)
    try {
      const { exportPptx } = await import('../services/api')
      await exportPptx(prompt, 5, token)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
    >
      {loading ? '產出中...' : '📊 產出 PPTX'}
    </button>
  )
}
```

**Step 3：整合到工具列（Toolbar 或 Header）**

在適當位置引入 `ExportPptxButton`，傳入 token。

**Step 4：確認測試**

- 點擊「📊 產出 PPTX」
- 輸入主題
- 等待 AI 產生（約 5-15 秒）
- 自動下載 .pptx
- 用 PowerPoint / Keynote 開啟確認內容正確

**Step 5：Commit**

```bash
git add frontend/src/components/ExportPptxButton.tsx \
        frontend/src/services/api.ts
git commit -m "feat: add ExportPptxButton for AI-driven PPTX download"
```

---

## Phase 4：收尾

### Task 8：更新 .env.example 和 README

**Objective:** 確保文件反映新功能

**Files:**
- Modify: `README.md`

**新增說明內容：**

```markdown
## 📎 檔案上傳功能

支援上傳以下格式作為 AI 對話的 context：
- `.txt` — 純文字
- `.pdf` — PDF 文件（提取文字層）
- `.pptx` — PowerPoint 投影片（提取每頁文字）

上傳限制：最大 10MB，提取文字上限 20,000 字元。

## 📊 產出 PowerPoint

點擊工具列「📊 產出 PPTX」按鈕，輸入簡報主題，
AI 自動產出 .pptx 並下載。
```

**Commit:**

```bash
git add README.md
git commit -m "docs: update README with file upload and PPTX export instructions"
```

---

### Task 9：最終安全掃描與 Push

**Objective:** Push 前確認沒有隱私資料或 key 洩漏

**安全檢查清單：**
- [ ] requirements.txt 無硬編碼 key
- [ ] upload.py / export.py 無硬編碼 token
- [ ] 無 .env 實體檔案被加入
- [ ] 無 __pycache__ 被加入
- [ ] 無使用者資料（.db, .json data）被加入

**確認後 Push：**

```bash
git log --oneline -10  # 確認 commit 歷史正確
git push origin feat/file-upload-pptx-export
```

**建立 PR：**
- Title: `feat: file upload (PDF/PPTX/TXT) + AI PowerPoint export`
- Base: `main`

---

## 總覽

| Task | 說明 | 影響範圍 |
|------|------|---------|
| 1 | 新增套件依賴 | `requirements.txt` |
| 2 | 檔案解析服務 | `services/file_service.py` |
| 3 | PPTX 組裝服務 | `services/export_service.py` |
| 4 | 上傳 API | `api/upload.py` |
| 5 | 產出 PPTX API | `api/export.py` |
| 6 | 前端上傳按鈕 | `FileUploadButton.tsx`, `InputBar.tsx` |
| 7 | 前端產出按鈕 | `ExportPptxButton.tsx` |
| 8 | 文件更新 | `README.md` |
| 9 | 安全掃描 + Push | — |

**預估工作量：** 3–5 小時（含測試）
