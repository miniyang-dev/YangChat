import { test, expect, type Page } from "@playwright/test";
import path from "path";
import fs from "fs";
import os from "os";

// 測試帳密（從環境變數讀，與 backend conftest 一致）
const USERNAME = process.env.CHAT_USERNAME ?? "irene";
const PASSWORD = process.env.CHAT_PASSWORD ?? "88888888";

// 共用 login helper
async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("帳號").fill(USERNAME);
  await page.getByPlaceholder("密碼").fill(PASSWORD);
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page).toHaveURL("/", { timeout: 8000 });
}

test.describe("YangChat E2E", () => {

  // 1. 登入
  test("登入成功後顯示主畫面", async ({ page }) => {
    await login(page);
    await expect(page.getByText("Yang").first()).toBeVisible();
  });

  test("登入失敗停在登入頁", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("帳號").fill("wrong");
    await page.getByPlaceholder("密碼").fill("wrong");
    await page.getByRole("button", { name: "登入" }).click();
    await expect(page).toHaveURL("/login", { timeout: 5000 });
  });

  // 2. 輸入框狀態
  test("新對話後輸入框可用", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "新對話" }).click();
    await expect(page.getByTestId("message-input")).toBeEnabled();
  });

  test("有文字後送出按鈕啟用", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "新對話" }).click();
    await page.getByTestId("message-input").fill("hello");
    await expect(page.getByTestId("send-button")).toBeEnabled();
  });

  test("無文字時送出按鈕停用", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "新對話" }).click();
    await expect(page.getByTestId("send-button")).toBeDisabled();
  });

  // 3. 附件按鈕（合併後只剩一個迴紋針 button，不再用 label）
  test("只有一個附件按鈕", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "新對話" }).click();
    await expect(page.locator('button[title="上傳圖片或文件（自動判斷）"]')).toHaveCount(1);
  });

  test("點迴紋針觸發選擇器且 accept 含圖片與文件", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "新對話" }).click();
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 5000 }),
      page.locator('button[title="上傳圖片或文件（自動判斷）"]').click(),
    ]);
    expect(fileChooser).toBeTruthy();
    const accept = await fileChooser.element().getAttribute("accept") ?? "";
    expect(accept).toContain("image/jpeg");
    expect(accept).toContain(".pdf");
  });

  // 4. 文件上傳（txt → uploadFile 路線）
  test("上傳 TXT 文件後顯示附件標籤", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "新對話" }).click();

    const tmpFile = path.join(os.tmpdir(), "yangchat-test.txt");
    fs.writeFileSync(tmpFile, "這是測試文件，驗證上傳功能正常。");

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 5000 }),
      page.locator('button[title="上傳圖片或文件（自動判斷）"]').click(),
    ]);
    await fileChooser.setFiles(tmpFile);

    // 等附件標籤（正在解析 or 顯示字元數）
    await expect(
      page.locator("text=正在解析文件").or(page.locator("text=字元"))
    ).toBeVisible({ timeout: 15000 });

    fs.unlinkSync(tmpFile);
  });

  // 5. 搜尋功能
  test("搜尋按鈕可切換搜尋框", async ({ page }) => {
    await login(page);
    await page.getByTestId("search-toggle").click();
    await expect(page.getByTestId("search-input")).toBeVisible();
  });

  test("搜尋不存在關鍵字顯示無結果", async ({ page }) => {
    await login(page);
    await page.getByTestId("search-toggle").click();
    await page.getByTestId("search-input").fill("xyzzy_不存在_99999");
    await expect(
      page.locator("text=無符合結果").or(page.locator("text=輸入關鍵字"))
    ).toBeVisible({ timeout: 8000 });
  });

  // 6. 產圖功能
  test("Sparkles 按鈕顯示產圖 Modal", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "新對話" }).click();
    // 點 Sparkles 按鈕（title="AI 產圖"）
    await page.locator('button[title="AI 產圖"]').click();
    // Modal 出現
    await expect(page.locator("text=AI 產圖")).toBeVisible({ timeout: 3000 });
    await expect(page.getByPlaceholder(/描述你想要的圖片/)).toBeVisible();
  });

  test("產圖 Modal 可輸入 prompt 且 Esc 關閉", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "新對話" }).click();
    await page.locator('button[title="AI 產圖"]').click();
    const promptInput = page.getByPlaceholder(/描述你想要的圖片/);
    await promptInput.fill("一隻可愛的貓咪");
    await expect(promptInput).toHaveValue("一隻可愛的貓咪");
    // Esc 關閉
    await promptInput.press("Escape");
    await expect(promptInput).not.toBeVisible({ timeout: 2000 });
  });

  test("空 prompt 時產圖按鈕停用", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "新對話" }).click();
    await page.locator('button[title="AI 產圖"]').click();
    // 空 prompt → 產生圖片按鈕 disabled
    await expect(page.getByRole("button", { name: /產生圖片/ })).toBeDisabled();
  });

  // 7. Two-pass search classifier
  test("不需要搜尋的問題直接回答不顯示搜尋狀態", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "新對話" }).click();
    await page.getByTestId("message-input").fill("1+1等於多少？");
    await page.getByTestId("send-button").click();
    // 等 streaming 結束：message-input 重新 enabled
    await expect(page.getByTestId("message-input")).toBeEnabled({ timeout: 30000 });
    // 不應出現搜尋狀態文字
    await expect(page.getByText(/正在搜尋/)).not.toBeVisible();
    // assistant 回答（prose div）應包含「2」
    await expect(page.locator(".prose").last()).toContainText("2");
  });

  test("股價問題觸發搜尋並回傳含股票關鍵字的回答", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "新對話" }).click();
    await page.getByTestId("message-input").fill("台積電今天股價多少？");
    await page.getByTestId("send-button").click();
    // 先等搜尋狀態出現（確認有觸發搜尋）
    await expect(page.getByText(/正在搜尋/)).toBeVisible({ timeout: 15000 });
    // 再等搜尋狀態消失（回答完成）
    await expect(page.getByText(/正在搜尋/)).not.toBeVisible({ timeout: 60000 });
    // streaming 完全結束，.prose 包含股票關鍵字
    await expect(page.locator(".prose").last()).toContainText(
      /台積電|TSMC|2330|股價/,
      { timeout: 10000 }
    );
  });

  // 8. 登出
  test("登出後回到登入頁", async ({ page }) => {
    await login(page);
    const logoutBtn = page.locator("button[title=\'登出\']").or(
      page.getByRole("button", { name: "登出" })
    );
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();
    await expect(page).toHaveURL("/login", { timeout: 5000 });
  });
});
