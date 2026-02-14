import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

test("worktree combobox loads options and launches selected worktree", async ({
  page,
}) => {
  await page.route("**/api/backendInitStatus", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        events: [],
        isReady: true,
        error: null,
        authCookieRefreshWindowSeconds: 900,
        worktreeName: "main",
        worktreeOptions: ["main", "feature-a"],
        worktreeOptionDetails: [
          {
            name: "main",
            path: "/tmp/setta",
            isActive: true,
          },
          {
            name: "feature-a",
            path: "/tmp/setta.feature-a",
            isActive: false,
          },
        ],
      }),
    });
  });

  await ensureAppReady(page);

  const combobox = page.getByTestId("worktree-combobox");
  await expect(combobox).toBeVisible();
  await expect(combobox).toContainText("Worktree");
  await expect(combobox.locator("input#worktree-combobox")).toHaveValue("main");

  await combobox.locator("button").first().click();
  await page.locator("dd", { hasText: "feature-a" }).click();
  await page.waitForURL("**/launching");

  const pendingLaunch = await page.evaluate(() => {
    const raw = sessionStorage.getItem("setta.pendingWorkspaceLaunch");
    return raw ? JSON.parse(raw) : null;
  });
  expect(pendingLaunch).not.toBeNull();
  expect(pendingLaunch.request.workspaceRoot).toBe("/tmp/setta.feature-a");
});
