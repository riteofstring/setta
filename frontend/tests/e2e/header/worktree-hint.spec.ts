import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

test("worktree hint shows (when available), is dismissible, and returns on refresh", async ({
  page,
}) => {
  await ensureAppReady(page);

  const response = await page.request.get(
    `${BACKEND_ORIGIN}/api/backendInitStatus`,
  );
  expect(response.ok()).toBeTruthy();
  const payload: unknown = await response.json();
  const worktreeName =
    payload && typeof payload === "object" && "worktreeName" in payload
      ? (payload as { worktreeName?: unknown }).worktreeName
      : null;

  const expected =
    typeof worktreeName === "string" && worktreeName ? worktreeName : null;

  const hint = page.getByTestId("worktree-hint");
  if (!expected) {
    await expect(hint).toHaveCount(0);
    return;
  }

  await expect(hint).toBeVisible();
  await expect(hint).toContainText(expected);

  await page.getByTestId("worktree-hint-close").click();
  await expect(hint).toHaveCount(0);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".setta-gpu-flow__pane");

  await expect(hint).toBeVisible();
  await expect(hint).toContainText(expected);
});
