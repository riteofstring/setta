import { expect, test, type Page } from "@playwright/test";

import {
  ensureAppReady,
  ensureManagedChatEngine,
  seedLocalStorage,
} from "../../helpers";

async function captureGetLlmResponseRequests(
  page: Page,
  capturedRequests: Array<Record<string, unknown>>,
): Promise<void> {
  await page.route("**/api/getLLMResponse", async (route) => {
    capturedRequests.push(
      route.request().postDataJSON() as Record<string, unknown>,
    );
    await route.continue();
  });
}

test("mcp mode sends hidden app generation request without app-config browser controls", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "App",
    overviewVis: true,
    appGenerationMode: "mcp_server",
    appGenerationPrompt: "Generate using MCP tools and persist app spec.",
  });
  await ensureAppReady(page);
  const cleanupEngine = await ensureManagedChatEngine(page);

  const capturedRequests: Array<Record<string, unknown>> = [];
  await captureGetLlmResponseRequests(page, capturedRequests);

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");
    await expect(page.getByText("App Config")).toBeVisible();

    await expect(page.getByText("Skills / MCP Browser")).toHaveCount(0);
    await expect(page.getByLabel("Figma source")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Send To Chat" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Send To Chat" }).click();
    await expect(
      page.getByText("App generation request sent to chat."),
    ).toBeVisible();

    expect(capturedRequests.length).toBe(1);
    const request = capturedRequests[0];
    expect(request.appGenerationMode).toBe("mcp_server");
    expect(request).not.toHaveProperty("skillsEnabled");
    const message = request.message as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const textContent = (message.content ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("\n");
    expect(textContent).toContain("App generation mode: mcp_server");
    expect(textContent).toContain(
      "Generate using MCP tools and persist app spec.",
    );
  } finally {
    await cleanupEngine();
  }
});
