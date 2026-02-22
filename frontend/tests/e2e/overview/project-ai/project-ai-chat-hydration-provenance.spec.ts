import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  seedLocalStorage,
} from "../../helpers";

test("project ai hydrates external threads using run provenance when engine selection differs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1480, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  const externalChatId = "pw-external-missing-engine";
  let externalHydrateCalls = 0;
  let llmHydrateCalls = 0;

  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-external-missing-engine",
          profileId: null,
          status: "completed",
          startedAt: "2026-01-10T00:00:00Z",
          finishedAt: "2026-01-10T00:00:02Z",
          events: [],
          inputs: {
            runType: "external_agent",
            projectConfigId: projectContext.projectConfigId,
            chatId: externalChatId,
            engineConfigId: "engine-config-removed",
            messages: [
              {
                id: "user-message-1",
                role: "user",
                content: [{ type: "text", text: "Open prior external thread" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "External missing engine thread",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
      ]),
    });
  });

  await page.route("**/api/getExternalAgentChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === externalChatId) {
      externalHydrateCalls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "assistant-external-hydrated",
            role: "assistant",
            content: [{ type: "text", text: "Hydrated from external endpoint." }],
          },
        ],
        waitingForResponse: false,
        toolCallArguments: {},
        contextUsage: null,
      }),
    });
  });

  await page.route("**/api/getLLMChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === externalChatId) {
      llmHydrateCalls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [],
        waitingForResponse: false,
        llmConfig: {
          id: "fallback-llm",
          model: "gpt-4o-mini",
          provider: "openai",
          mcpServerIds: [],
        },
        contextUsage: null,
      }),
    });
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    const threadsPanel = overviewPane.getByTestId("project-chat-threads-panel");
    await expect(threadsPanel).toBeVisible();

    const threadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "External missing engine thread" })
      .first();
    await expect(threadEntry).toBeVisible();
    await threadEntry.click();

    await expect.poll(() => externalHydrateCalls).toBeGreaterThan(0);
    expect(llmHydrateCalls).toBe(0);
    await expect(
      overviewPane.getByText("Hydrated from external endpoint.").first(),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai shows context unavailable when backend context telemetry is missing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1480, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  const chatId = "pw-context-unavailable";

  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-context-unavailable",
          profileId: null,
          status: "completed",
          startedAt: "2026-01-10T00:00:00Z",
          finishedAt: "2026-01-10T00:00:02Z",
          events: [],
          inputs: {
            runType: "external_agent",
            projectConfigId: projectContext.projectConfigId,
            chatId,
            engineConfigId: "engine-managed",
            messages: [
              {
                id: "user-message-1",
                role: "user",
                content: [{ type: "text", text: "Check context telemetry" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Context unavailable thread",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
      ]),
    });
  });

  await page.route("**/api/getExternalAgentChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId !== chatId) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [],
          waitingForResponse: false,
          toolCallArguments: {},
          contextUsage: null,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "assistant-context-unavailable",
            role: "assistant",
            content: [{ type: "text", text: "No context telemetry available." }],
          },
        ],
        waitingForResponse: false,
        llmConfig: {
          id: "default-llm",
          model: "gpt-4o-mini",
          provider: "openai",
          base_url: null,
          api_key_env: null,
          other_params: null,
          mcpServerIds: null,
          temporary: false,
        },
        contextUsage: null,
      }),
    });
  });

  await page.route("**/api/getLLMChat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [],
        waitingForResponse: false,
        llmConfig: {
          id: "default-llm",
          model: "gpt-4o-mini",
          provider: "openai",
          base_url: null,
          api_key_env: null,
          other_params: null,
          mcpServerIds: null,
          temporary: false,
        },
        contextUsage: {
          contextWindowTokens: 1000,
          contextUsedTokens: 100,
          estimated: false,
        },
      }),
    });
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    const threadsPanel = overviewPane.getByTestId("project-chat-threads-panel");
    await expect(threadsPanel).toBeVisible();

    const threadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Context unavailable thread" })
      .first();
    await expect(threadEntry).toBeVisible();
    await threadEntry.click();

    await expect(
      overviewPane.getByText("No context telemetry available.").first(),
    ).toBeVisible();
    await expect(overviewPane.getByLabel("context unavailable")).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
