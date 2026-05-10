import { expect, test, type Page } from "@playwright/test";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  ensureAppReady,
  ensureProjectChatThreadsPanelVisible,
  getVisibleProjectChatSurface,
  openIsolatedProject,
  seedLocalStorage,
} from "../../helpers";

async function seedAIStore(
  page: Page,
  patch: Record<string, unknown>,
): Promise<void> {
  await page.addInitScript((nextState) => {
    const key = "setta_ai_data";
    let payload: { state: Record<string, unknown>; version: number } = {
      state: {},
      version: 0,
    };
    const raw = window.localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          state?: unknown;
          version?: unknown;
        };
        payload = {
          state:
            parsed && typeof parsed.state === "object" && parsed.state !== null
              ? (parsed.state as Record<string, unknown>)
              : {},
          version: typeof parsed?.version === "number" ? parsed.version : 0,
        };
      } catch {
        payload = { state: {}, version: 0 };
      }
    }
    payload.state = { ...payload.state, ...nextState };
    window.localStorage.setItem(key, JSON.stringify(payload));
  }, patch);
}

async function bindVisibleProjectChatWindowToChatId(
  page: Page,
  chatId: string,
): Promise<void> {
  await page.evaluate(async (nextChatId: string) => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const {
      ChatWindowPlacementEnum,
      createProjectChatWindowInstance,
      createProjectChatWindowingState,
    } = await import("/src/utils/generatedTypes.ts");
    useProjectState.setState((state) => {
      const firstWindowId =
        state.projectChatWindowing.order[0] ?? "project-chat-window-1";
      const current =
        state.projectChatWindowing.instancesById[firstWindowId] ?? null;
      if (!current) {
        state.projectChatWindowing = createProjectChatWindowingState({
          order: [firstWindowId],
          instancesById: {
            [firstWindowId]: createProjectChatWindowInstance({
              instanceId: firstWindowId,
              placement: ChatWindowPlacementEnum.bottom_docked,
              chatId: nextChatId,
              isMinimized: false,
            }),
          },
        });
        return;
      }
      state.projectChatWindowing.instancesById[firstWindowId] = {
        ...current,
        chatId: nextChatId,
        isMinimized: false,
      };
    });
  }, chatId);
}

function buildGetLLMResponseResponse(chatId: string) {
  return chatId;
}

test("project ai stops retrying hydration after terminal 404 failures", async ({
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

  const terminalChatId = "pw-hydration-terminal-404";
  let terminalHydrateCalls = 0;

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-terminal-404",
          name: "Terminal Retry Engine",
          engineType: "external_agent",
          externalAgentConfigId: "external-config-terminal-404",
          settaLlmConfigId: null,
        },
      ]),
    });
  });

  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-terminal-404",
          profileId: null,
          status: "completed",
          startedAt: "2026-03-10T00:00:00Z",
          finishedAt: "2026-03-10T00:00:01Z",
          events: [],
          inputs: {
            runType: "external_agent",
            projectConfigId: projectContext.projectConfigId,
            chatId: terminalChatId,
            engineConfigId: "engine-terminal-404",
            messages: [
              {
                id: "terminal-user-1",
                role: "user",
                content: [{ type: "text", text: "Hydrate missing chat" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Terminal hydration thread",
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
    if (payload?.chatId === terminalChatId) {
      terminalHydrateCalls += 1;
    }
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        detail: {
          errorCode: "chat_not_found",
          message: "Chat not found.",
        },
      }),
    });
  });

  await page.route("**/api/getLLMChat", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        detail: {
          errorCode: "chat_not_found",
          message: "Chat not found.",
        },
      }),
    });
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".setta-gpu-flow__pane");

    const overviewPane = await getVisibleProjectChatSurface(page);
    const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);
    await expect(threadsPanel).toBeVisible();

    const threadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Terminal hydration thread" })
      .first();
    await expect(threadEntry).toBeVisible();
    allowExpectedApiError(page, {
      path: "/api/getExternalAgentChat",
      method: "POST",
      statuses: [404],
      count: 4,
    });
    await threadEntry.click();

    await expect.poll(() => terminalHydrateCalls).toBeGreaterThan(0);
    const initialTerminalHydrateCalls = terminalHydrateCalls;
    await page.waitForTimeout(3200);
    expect(terminalHydrateCalls).toBe(initialTerminalHydrateCalls);
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

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-managed",
          name: "Managed External Engine",
          engineType: "external_agent",
          externalAgentConfigId: "external-config-managed",
          settaLlmConfigId: null,
        },
      ]),
    });
  });

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
            content: [
              { type: "text", text: "No context telemetry available." },
            ],
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
    await page.waitForSelector(".setta-gpu-flow__pane");

    const overviewPane = await getVisibleProjectChatSurface(page);
    const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);
    await expect(threadsPanel).toBeVisible();

    const threadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Context unavailable thread" })
      .first();
    await expect(threadEntry).toBeVisible();
    await expect(overviewPane.getByLabel("context unavailable")).toHaveCount(0);
    await threadEntry.click();

    await expect(
      overviewPane.getByText("No context telemetry available.").first(),
    ).toBeVisible();
    await expect(overviewPane.getByLabel("context unavailable")).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai shows context-left badge for external chats when backend telemetry is complete", async ({
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

  const chatId = "pw-context-complete";

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-managed",
          name: "Managed External Engine",
          engineType: "external_agent",
          externalAgentConfigId: "external-config-managed",
          settaLlmConfigId: null,
        },
      ]),
    });
  });

  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-context-complete",
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
            name: "Context complete thread",
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
            id: "assistant-context-complete",
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Context telemetry is complete.",
              },
            ],
          },
        ],
        waitingForResponse: false,
        contextUsage: {
          contextWindowTokens: 258400,
          contextUsedTokens: 4852,
          estimated: false,
        },
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
    await page.waitForSelector(".setta-gpu-flow__pane");

    const overviewPane = await getVisibleProjectChatSurface(page);
    const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);
    await expect(threadsPanel).toBeVisible();

    const threadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Context complete thread" })
      .first();
    await expect(threadEntry).toBeVisible();
    await threadEntry.click();

    await expect(
      overviewPane.getByText("Context telemetry is complete.").first(),
    ).toBeVisible();
    await expect(
      overviewPane.getByRole("button", {
        name: /context(?: left)? [0-9]+%/i,
      }),
    ).toBeVisible();
    await expect(overviewPane.getByLabel("context unavailable")).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai warns on stale selected chat ids without hard-blocking composer", async ({
  page,
}) => {
  const staleChatId = "pw-stale-selected-chat";
  let llmHydrateCalls = 0;
  await page.setViewportSize({ width: 1480, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-config-llm",
          name: "Primary LLM Engine",
          engineType: "setta_llm",
          settaLlmConfigId: "primary",
          externalAgentConfigId: null,
        },
      ]),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {
          primary: {
            id: "primary",
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: null,
            base_url: null,
            other_params: {},
            mcpServerIds: [],
          },
        },
        default_config_id: "primary",
        mcpServers: {},
      }),
    });
  });
  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
  await page.route("**/api/getLLMChat", async (route) => {
    llmHydrateCalls += 1;
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        detail: {
          errorCode: "chat_not_found",
          message: "Chat not found.",
        },
      }),
    });
  });

  try {
    await seedAIStore(page, {
      activeChatId: staleChatId,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".setta-gpu-flow__pane");
    const overviewPane = await getVisibleProjectChatSurface(page);
    await bindVisibleProjectChatWindowToChatId(page, staleChatId);

    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toContainText("missing provenance metadata");
    const input = overviewPane.locator("textarea").first();
    await input.fill("Warn but keep composer usable.");
    await expect(
      overviewPane.locator('button[type="submit"]').first(),
    ).toBeEnabled();
    await page.waitForTimeout(300);
    expect(llmHydrateCalls).toBe(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai keeps composer usable when in-flight submitted chats warn about missing provenance", async ({
  page,
}) => {
  const inFlightChatId = "pw-in-flight-missing-provenance";
  let llmSubmitCalls = 0;
  let llmHydrateCalls = 0;
  await page.setViewportSize({ width: 1480, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-config-llm",
          name: "Primary LLM Engine",
          engineType: "setta_llm",
          settaLlmConfigId: "primary",
          externalAgentConfigId: null,
        },
      ]),
    });
  });
  await page.route("**/api/llm/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        configs: {
          primary: {
            id: "primary",
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: "OPENAI_API_KEY",
            base_url: null,
            other_params: {},
            mcpServerIds: [],
          },
        },
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: "primary",
      }),
    });
  });
  await page.route("**/api/llm/apiKeys", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        apiKeys: {
          OPENAI_API_KEY: "pw-openai-key",
        },
        revision: 1,
      }),
    });
  });
  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
  await page.route("**/api/getLLMResponse", async (route) => {
    llmSubmitCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildGetLLMResponseResponse(inFlightChatId)),
    });
  });
  await page.route("**/api/getLLMChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === inFlightChatId) {
      llmHydrateCalls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "assistant-in-flight-missing-provenance",
            role: "assistant",
            content: [{ type: "text", text: "Still processing response..." }],
          },
        ],
        waitingForResponse: true,
        llmConfig: {
          id: "primary",
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
    await page.waitForSelector(".setta-gpu-flow__pane");
    const overviewPane = await getVisibleProjectChatSurface(page);
    const input = overviewPane.locator("textarea").first();
    await expect(input).toBeVisible();

    await input.fill("Trigger in-flight provenance gap.");
    await input.press("Enter");

    await expect.poll(() => llmSubmitCalls).toBeGreaterThanOrEqual(1);
    await expect.poll(() => llmHydrateCalls).toBeGreaterThanOrEqual(1);
    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toContainText("missing provenance metadata");
    await expect(
      overviewPane.locator('button[type="submit"]').first(),
    ).toBeEnabled();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
