import { expect, test } from "@playwright/test";

import { ensureAppReady, seedLocalStorage } from "../helpers";

test("mcp mode sends hidden app generation request without app-config browser controls", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "App",
    overviewVis: true,
    appGenerationMode: "mcp_server",
    appGenerationPrompt: "Generate using MCP tools and persist app spec.",
  });

  const capturedRequests: Array<Record<string, unknown>> = [];
  await page.route("**/api/getLLMResponse", async (route) => {
    capturedRequests.push(
      route.request().postDataJSON() as Record<string, unknown>,
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(`pw-chat-${Date.now()}`),
    });
  });

  await ensureAppReady(page);
  await expect(page.getByText("App Config")).toBeVisible();

  await expect(page.getByText("Skills / MCP Browser")).toHaveCount(0);
  await expect(page.getByLabel("Figma source")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send To Chat" })).toBeVisible();

  await page.getByRole("button", { name: "Send To Chat" }).click();
  await expect(
    page.getByText("App generation request sent to chat."),
  ).toBeVisible();

  expect(capturedRequests.length).toBe(1);
  const request = capturedRequests[0];
  expect(request.appGenerationMode).toBe("mcp_server");
  const message = request.message as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const textContent = (message.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n");
  expect(textContent).toContain("App generation mode: mcp_server");
  expect(textContent).toContain("MCP/Figma flow guidance:");
});
