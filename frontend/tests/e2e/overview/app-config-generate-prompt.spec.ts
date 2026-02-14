import { expect, test } from "@playwright/test";

import {
  ensureAppReady,
  ensureManagedChatEngine,
  seedLocalStorage,
} from "../helpers";

test("app config prompt preview can be edited and sent without tab switch", async ({
  page,
}) => {
  await ensureManagedChatEngine(page);
  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);

  await expect(page.getByText("App Config")).toBeVisible();

  const catalogId = await page.getByLabel("Catalog ID").inputValue();
  await page.getByRole("button", { name: "Build Prompt", exact: true }).click();

  const promptPreview = page.getByLabel("App generation prompt preview");
  await expect(promptPreview).toBeVisible();
  await expect(promptPreview).toContainText(
    "Generate a JSON Render app definition (appSpec + routes) using the catalog below.",
  );

  const prompt = await promptPreview.inputValue();
  expect(prompt).toContain("DO NOT paste JSON into the chat.");
  expect(prompt).toContain("setta__set_app_definition");
  expect(prompt).toContain(`Catalog: ${catalogId}`);
  expect(prompt).toContain("Pages and navigation:");
  expect(prompt).toContain("- Treat tab view modes as pages.");
  expect(prompt).toContain("- routes: list of { path, name, rootKey }");

  const marker = `E2E-PROMPT-${Date.now()}`;
  await promptPreview.fill(`${prompt}\n\n${marker}`);

  const requestPromise = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith("/getLLMResponse"),
  );
  await page.getByRole("button", { name: "Send to Project AI Chat" }).click();
  const request = await requestPromise;
  const payload = request.postDataJSON() as {
    message?: {
      content?: Array<{ text?: string }>;
    };
    overrideSkillIds?: string[] | null;
  };
  expect(payload.message?.content?.[0]?.text ?? "").toContain(marker);
  expect(Array.isArray(payload.overrideSkillIds)).toBeTruthy();
  await expect(page.getByText("App Config")).toBeVisible();
});
