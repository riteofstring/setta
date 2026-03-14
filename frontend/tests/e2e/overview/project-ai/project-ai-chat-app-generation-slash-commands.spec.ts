import { expect, test, type Page } from "@playwright/test";

import { APP_GENERATION_SLASH_COMMANDS } from "../../../../src/components/Chat/appGenerationSlashCommands";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  getVisibleProjectChatSurface,
  openIsolatedProject,
  setOverviewTab,
} from "../../helpers";

type ChatSubmitRequest = {
  appGenerationMode?: string | null;
  appGenerationReferenceImageUrl?: string | null;
  appGenerationReferenceImageNotes?: string | null;
  message?: {
    content?: Array<{ type?: string; text?: string }>;
    attachments?: Array<{ name?: string }>;
  };
};

async function mockProjectChatSubmitCapture(
  page: Page,
  capturedRequests: ChatSubmitRequest[],
): Promise<void> {
  await page.route("**/api/getLLMResponse", async (route) => {
    capturedRequests.push(route.request().postDataJSON() as ChatSubmitRequest);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(`pw-appgen-chat-${Date.now()}`),
    });
  });
  await page.route("**/api/getLLMChat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [],
        waitingForResponse: false,
        llmConfig: null,
      }),
    });
  });
}

async function openProjectChatWithManagedEngine(page: Page) {
  await setOverviewTab(page, "ProjectAIChat");
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);
  await page.reload();
  await page.waitForSelector(".react-flow__pane");
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  await expect(projectChatSurface.getByTestId("chat-input-textarea")).toBeVisible();
  return { engineCleanup, projectContext, projectChatSurface };
}

function getCommandPrompt(command: string): string {
  const entry = APP_GENERATION_SLASH_COMMANDS.find(
    (slashCommand) => slashCommand.command === command,
  );
  if (!entry) {
    throw new Error(`Missing app generation slash command definition: ${command}`);
  }
  return entry.promptTemplate;
}

test("project ai chat /app-json submits the fixed baseline prompt with suffix text", async ({
  page,
}) => {
  const capturedRequests: ChatSubmitRequest[] = [];
  await mockProjectChatSubmitCapture(page, capturedRequests);
  const { engineCleanup, projectContext, projectChatSurface } =
    await openProjectChatWithManagedEngine(page);

  try {
    await projectChatSurface
      .getByTestId("chat-input-textarea")
      .fill("/app-json dashboard for support ops");
    await projectChatSurface.getByLabel("Send message").click();

    await expect.poll(() => capturedRequests.length).toBe(1);
    expect(capturedRequests[0]?.appGenerationMode).toBe("json_render");
    expect(capturedRequests[0]?.appGenerationReferenceImageUrl).toBeNull();
    expect(capturedRequests[0]?.appGenerationReferenceImageNotes).toBeNull();
    expect(capturedRequests[0]?.message?.content?.[0]?.text).toBe(
      `${getCommandPrompt("/app-json")}\n\ndashboard for support ops`,
    );
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat /app-image preserves attachments while appending suffix text", async ({
  page,
}) => {
  const capturedRequests: ChatSubmitRequest[] = [];
  await mockProjectChatSubmitCapture(page, capturedRequests);
  const { engineCleanup, projectContext, projectChatSurface } =
    await openProjectChatWithManagedEngine(page);

  try {
    await projectChatSurface
      .locator('input[type="file"]')
      .first()
      .setInputFiles({
        name: "reference.png",
        mimeType: "image/png",
        buffer: Buffer.from("png"),
      });
    await expect(projectChatSurface.getByText("reference.png")).toBeVisible();

    await projectChatSurface
      .getByTestId("chat-input-textarea")
      .fill("/app-image compact admin dashboard");
    await projectChatSurface.getByLabel("Send message").click();

    await expect.poll(() => capturedRequests.length).toBe(1);
    expect(capturedRequests[0]?.appGenerationMode).toBe(
      "json_render_with_image",
    );
    expect(capturedRequests[0]?.message?.content?.[0]?.text).toBe(
      `${getCommandPrompt("/app-image")}\n\ncompact admin dashboard`,
    );
    expect(capturedRequests[0]?.message?.attachments).toHaveLength(1);
    expect(capturedRequests[0]?.message?.attachments?.[0]?.name).toBe(
      "reference.png",
    );
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat /app-mcp submits the fixed MCP-oriented baseline without extra chooser UI", async ({
  page,
}) => {
  const capturedRequests: ChatSubmitRequest[] = [];
  await mockProjectChatSubmitCapture(page, capturedRequests);
  const { engineCleanup, projectContext, projectChatSurface } =
    await openProjectChatWithManagedEngine(page);

  try {
    await projectChatSurface.getByTestId("chat-input-textarea").fill("/app-mcp");
    await projectChatSurface.getByLabel("Send message").click();

    await expect.poll(() => capturedRequests.length).toBe(1);
    expect(capturedRequests[0]?.appGenerationMode).toBe("mcp_server");
    expect(capturedRequests[0]?.message?.content?.[0]?.text).toBe(
      getCommandPrompt("/app-mcp"),
    );
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});
