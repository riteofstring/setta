import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setOverviewTab,
} from "../helpers";

test("project chat skips workspace root scan when returning to an existing chat", async ({
  page,
}) => {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  let getRootCalls = 0;
  let getFolderCalls = 0;
  // Count expensive root-scan endpoints while still serving real backend responses.
  await page.route("**/api/getFileBrowserRoot", async (route) => {
    getRootCalls += 1;
    await route.continue();
  });
  await page.route("**/api/getFolderContents", async (route) => {
    getFolderCalls += 1;
    await route.continue();
  });

  const fakeChatId = "pw-project-chat-existing";
  await page.route("**/api/getLLMResponse", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fakeChatId),
    });
  });
  await page.route("**/api/getLLMChat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "pw-user-msg",
            role: "user",
            content: [{ type: "text", text: "hello from playwright" }],
            attachments: [],
          },
          {
            id: "pw-assistant-msg",
            role: "assistant",
            content: [{ type: "text", text: "ready" }],
          },
        ],
        waitingForResponse: false,
        llmConfig: {
          id: "e2e-llm",
          model: "gpt-4o-mini",
          provider: "openai",
          api_key_env: null,
          base_url: null,
          other_params: {},
          mcpServerIds: [],
        },
      }),
    });
  });

  try {
    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    await expect(
      overviewPane.getByRole("heading", { name: "Project AI Chat" }),
    ).toBeVisible();

    const input = overviewPane.getByPlaceholder("Type a message...");
    await input.fill("Start existing chat");
    await input.press("Enter");
    await expect(overviewPane.getByText("hello from playwright")).toBeVisible();

    const baselineRootCalls = getRootCalls;
    const baselineFolderCalls = getFolderCalls;

    // Re-mount Project AI Chat with an active chat to verify scans are skipped.
    await page.getByTestId("overview-tab-overview").click();
    await page.getByTestId("overview-tab-project-ai-chat").click();
    await expect(
      overviewPane.getByRole("heading", { name: "Project AI Chat" }),
    ).toBeVisible();
    await expect(overviewPane.getByText("hello from playwright")).toBeVisible();

    await page.waitForTimeout(300);
    expect(getRootCalls).toBe(baselineRootCalls);
    expect(getFolderCalls).toBe(baselineFolderCalls);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});
