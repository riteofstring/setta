import path from "path";
import { fileURLToPath } from "url";

import { expect, test } from "@playwright/test";

import {
  ensureAppReady,
  ensureManagedChatEngine,
  seedLocalStorage,
} from "../helpers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("app config includes style image in prompt preview and sends it to chat", async ({
  page,
}) => {
  await ensureManagedChatEngine(page);
  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);

  await expect(page.getByText("App Config")).toBeVisible();

  const filePath = path.join(
    __dirname,
    "../../../../images/setta-github-dark.png",
  );
  await page
    .locator('input[aria-label="Style reference image"]')
    .setInputFiles(filePath);

  await expect(page.getByText("setta-github-dark.png")).toBeVisible();

  await page.getByRole("button", { name: "Build Prompt", exact: true }).click();
  const promptPreview = page.getByLabel("App generation prompt preview");
  await expect(promptPreview).toContainText("Style reference:");
  await expect(promptPreview).toContainText(
    "Treat it as the style reference for the app's look and feel.",
  );

  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith("/getLLMResponse"),
  );
  await page.getByRole("button", { name: "Send to Project AI Chat" }).click();
  const request = await requestPromise;
  const payload = request.postDataJSON() as {
    message?: {
      attachments?: Array<{ id?: string; name?: string }>;
    };
  };
  expect(payload.message?.attachments?.length ?? 0).toBeGreaterThan(0);
  expect(payload.message?.attachments?.[0]?.name).toBe("setta-github-dark.png");
});
