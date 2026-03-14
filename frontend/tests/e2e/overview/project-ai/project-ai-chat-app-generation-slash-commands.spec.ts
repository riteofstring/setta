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
  chatId?: string | null;
  appGenerationMode?: string | null;
  appGenerationByMessageId?: Record<string, string>;
  message?: {
    id?: string;
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
    attachments?: Array<{ name?: string }>;
  };
};

async function mockProjectChatSubmitCapture(
  page: Page,
  capturedRequests: ChatSubmitRequest[],
): Promise<void> {
  const chatStateById = new Map<
    string,
    {
      messages: Array<NonNullable<ChatSubmitRequest["message"]>>;
      appGenerationByMessageId: Record<string, string>;
    }
  >();
  let createdChatCount = 0;
  let assistantMessageCount = 0;

  await page.route("**/api/getLLMResponse", async (route) => {
    const payload = route.request().postDataJSON() as ChatSubmitRequest;
    capturedRequests.push(payload);
    const returnedChatId =
      payload.chatId ?? `pw-appgen-chat-${createdChatCount + 1}`;
    const previousState = chatStateById.get(returnedChatId) ?? {
      messages: [],
      appGenerationByMessageId: {},
    };
    const nextMessages = [...previousState.messages];
    if (payload.message) {
      nextMessages.push(payload.message);
      assistantMessageCount += 1;
      nextMessages.push({
        id: `assistant-${assistantMessageCount}`,
        role: "assistant",
        content: [
          {
            type: "text",
            text: `Mock response ${assistantMessageCount}`,
          },
        ],
        attachments: [],
      });
    }
    chatStateById.set(returnedChatId, {
      messages: nextMessages,
      appGenerationByMessageId: payload.appGenerationByMessageId ?? {},
    });
    if (payload.chatId == null) {
      createdChatCount += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(returnedChatId),
    });
  });
  await page.route("**/api/getLLMChat", async (route) => {
    const payload = route.request().postDataJSON() as {
      chatId?: string;
    };
    const chatState =
      typeof payload.chatId === "string"
        ? chatStateById.get(payload.chatId) ?? null
        : null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: chatState?.messages ?? [],
        waitingForResponse: false,
        llmConfig: null,
        contextUsage: null,
        appGenerationByMessageId: chatState?.appGenerationByMessageId ?? {},
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
  await expect(
    projectChatSurface.getByTestId("chat-input-textarea"),
  ).toBeVisible();
  return { engineCleanup, projectContext, projectChatSurface };
}

async function submitProjectChatMessage(
  page: Page,
  projectChatSurface: Awaited<ReturnType<typeof getVisibleProjectChatSurface>>,
  text: string,
) {
  await projectChatSurface.getByTestId("chat-input-textarea").fill(text);
  await projectChatSurface.locator('button[type="submit"]').click();
  await page.waitForTimeout(50);
}

function getCommandPrompt(command: string): string {
  const entry = APP_GENERATION_SLASH_COMMANDS.find(
    (slashCommand) => slashCommand.command === command,
  );
  if (!entry) {
    throw new Error(
      `Missing app generation slash command definition: ${command}`,
    );
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
    expect(capturedRequests[0]?.appGenerationByMessageId).toEqual({
      [capturedRequests[0]?.message?.id ?? ""]: "json_render",
    });
    expect(capturedRequests[0]?.message?.content?.[0]?.text).toBe(
      `${getCommandPrompt("/app-json")}\n\ndashboard for support ops`,
    );
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat /app-image requires an image attachment before submitting", async ({
  page,
}) => {
  const capturedRequests: ChatSubmitRequest[] = [];
  await mockProjectChatSubmitCapture(page, capturedRequests);
  const { engineCleanup, projectContext, projectChatSurface } =
    await openProjectChatWithManagedEngine(page);

  try {
    await projectChatSurface
      .getByTestId("chat-input-textarea")
      .fill("/app-image compact admin dashboard");
    await projectChatSurface.getByLabel("Send message").click();

    await expect(projectChatSurface).toContainText(
      "Attach at least one image before using /app-image.",
    );
    await page.waitForTimeout(200);
    expect(capturedRequests).toHaveLength(0);
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
    expect(capturedRequests[0]?.appGenerationByMessageId).toEqual({
      [capturedRequests[0]?.message?.id ?? ""]: "json_render_with_image",
    });
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
    await projectChatSurface
      .getByTestId("chat-input-textarea")
      .fill("/app-mcp");
    await projectChatSurface.getByLabel("Send message").click();

    await expect.poll(() => capturedRequests.length).toBe(1);
    expect(capturedRequests[0]?.appGenerationMode).toBe("mcp_server");
    expect(capturedRequests[0]?.appGenerationByMessageId).toEqual({
      [capturedRequests[0]?.message?.id ?? ""]: "mcp_server",
    });
    expect(capturedRequests[0]?.message?.content?.[0]?.text).toBe(
      getCommandPrompt("/app-mcp"),
    );
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat follow-up messages keep the active app-generation mode", async ({
  page,
}) => {
  const capturedRequests: ChatSubmitRequest[] = [];
  await mockProjectChatSubmitCapture(page, capturedRequests);
  const { engineCleanup, projectContext, projectChatSurface } =
    await openProjectChatWithManagedEngine(page);

  try {
    await submitProjectChatMessage(
      page,
      projectChatSurface,
      "/app-prompt product landing page",
    );
    await expect.poll(() => capturedRequests.length).toBe(1);

    await submitProjectChatMessage(
      page,
      projectChatSurface,
      "make the hero denser",
    );
    await expect.poll(() => capturedRequests.length).toBe(2);

    expect(capturedRequests[1]?.appGenerationMode).toBe("prompt_builder");
    expect(capturedRequests[1]?.appGenerationByMessageId).toEqual({
      [capturedRequests[0]?.message?.id ?? ""]: "prompt_builder",
      [capturedRequests[1]?.message?.id ?? ""]: "prompt_builder",
    });
    expect(capturedRequests[1]?.message?.content?.[0]?.text).toBe(
      "make the hero denser",
    );
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat replays queued /app-json through the same app-generation path", async ({
  page,
}) => {
  const capturedRequests: ChatSubmitRequest[] = [];
  let releaseFirstRequest: (() => void) | null = null;
  const firstRequestReleased = new Promise<void>((resolve) => {
    releaseFirstRequest = resolve;
  });

  await page.route("**/api/getLLMResponse", async (route) => {
    capturedRequests.push(route.request().postDataJSON() as ChatSubmitRequest);
    if (capturedRequests.length === 1) {
      await firstRequestReleased;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(`pw-appgen-chat-${capturedRequests.length}`),
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

  const { engineCleanup, projectContext, projectChatSurface } =
    await openProjectChatWithManagedEngine(page);

  try {
    await submitProjectChatMessage(
      page,
      projectChatSurface,
      "Hold this first response open.",
    );
    await expect.poll(() => capturedRequests.length).toBe(1);

    await submitProjectChatMessage(
      page,
      projectChatSurface,
      "/app-json dashboard for support ops",
    );

    if (!releaseFirstRequest) {
      throw new Error("Expected first request release callback.");
    }
    releaseFirstRequest();

    await expect.poll(() => capturedRequests.length).toBe(2);
    expect(capturedRequests[1]?.appGenerationMode).toBe("json_render");
    expect(capturedRequests[1]?.appGenerationByMessageId).toEqual({
      [capturedRequests[1]?.message?.id ?? ""]: "json_render",
    });
    expect(capturedRequests[1]?.message?.content?.[0]?.text).toBe(
      `${getCommandPrompt("/app-json")}\n\ndashboard for support ops`,
    );
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});
