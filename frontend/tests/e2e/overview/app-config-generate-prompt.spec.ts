import { expect, test } from "@playwright/test";

import { ensureAppReady, seedLocalStorage } from "../helpers";

test("prompt-builder mode sends hidden app generation request to chat", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "App",
    overviewVis: true,
    appGenerationMode: "prompt_builder",
  });
  await ensureAppReady(page);

  await expect(page.getByText("App Config")).toBeVisible();
  await page
    .getByLabel("Generation Prompt")
    .fill("Build a compact analytics dashboard with two cards.");

  const capturedRequests: Array<Record<string, unknown>> = [];
  await page.route("**/api/getLLMResponse", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    capturedRequests.push(payload);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(`pw-chat-${Date.now()}`),
    });
  });

  await page.getByRole("button", { name: "Send To Chat" }).click();
  await expect(
    page.getByText("App generation request sent to chat."),
  ).toBeVisible();

  expect(capturedRequests.length).toBe(1);
  const request = capturedRequests[0];
  expect(request.appGenerationMode).toBe("prompt_builder");
  expect(request.appGenerationReferenceImageUrl).toBeNull();

  const message = request.message as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const textContent = (message.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
  expect(textContent).toContain("App generation mode: prompt_builder");
  expect(textContent).toContain(
    "Build a compact analytics dashboard with two cards.",
  );
});
