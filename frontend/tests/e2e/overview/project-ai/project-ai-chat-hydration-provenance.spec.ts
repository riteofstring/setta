import { expect, test, type Page, type Route } from "@playwright/test";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  ensureAppReady,
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

test("project ai hydrates external threads via external provenance endpoint", async ({
  page,
}) => {
  const externalChatId = "pw-external-provenance";
  let externalHydrateCalls = 0;
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
          id: "engine-config-external",
          name: "External Engine",
          engineType: "external_agent",
          externalAgentConfigId: "external-config-1",
          settaLlmConfigId: null,
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
            content: [
              { type: "text", text: "Hydrated from external endpoint." },
            ],
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

  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-external-provenance",
          profileId: null,
          status: "completed",
          startedAt: "2026-01-10T00:00:00Z",
          finishedAt: "2026-01-10T00:00:02Z",
          events: [],
          inputs: {
            runType: "external_agent",
            projectConfigId: projectContext.projectConfigId,
            chatId: externalChatId,
            engineConfigId: "engine-config-external",
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
            name: "External provenance thread",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
      ]),
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
      .filter({ hasText: "External provenance thread" })
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

test("project ai blocks selected threads when persisted engine config is missing", async ({
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

  const blockedChatId = "pw-llm-missing-engine";
  let llmHydrateCalls = 0;
  let llmSubmitCalls = 0;

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

  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-llm-missing-engine",
          profileId: null,
          status: "completed",
          startedAt: "2026-04-10T00:00:00Z",
          finishedAt: "2026-04-10T00:00:01Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId: blockedChatId,
            engineConfigId: "engine-config-llm",
            messages: [
              {
                id: "blocked-user-1",
                role: "user",
                content: [{ type: "text", text: "Resume blocked thread" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Blocked provenance thread",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
      ]),
    });
  });

  await page.route("**/api/getLLMChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === blockedChatId) {
      llmHydrateCalls += 1;
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          detail: {
            errorCode: "engine_config_missing",
            message: "Chat engine config is no longer available.",
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [],
        waitingForResponse: false,
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

  await page.route("**/api/getLLMResponse", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === blockedChatId) {
      llmSubmitCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("unexpected-blocked-submit"),
      });
      return;
    }
    await route.continue();
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    const threadsPanel = overviewPane.getByTestId("project-chat-threads-panel");
    await expect(threadsPanel).toBeVisible();

    const threadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Blocked provenance thread" })
      .first();
    await expect(threadEntry).toBeVisible();
    allowExpectedApiError(page, {
      path: "/api/getLLMChat",
      method: "POST",
      statuses: [409],
      count: 1,
    });
    await threadEntry.click();

    await expect.poll(() => llmHydrateCalls).toBeGreaterThan(0);
    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toContainText("engine config is no longer available");
    await expect(
      overviewPane.locator('button[type="submit"]').first(),
    ).toBeDisabled();
    await page.waitForTimeout(500);
    expect(llmSubmitCalls).toBe(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai waits for authoritative provenance before hydrating a selected thread", async ({
  page,
}) => {
  const selectedChatId = "pw-selected-unknown-provenance";
  let llmHydrateCalls = 0;
  let externalHydrateCalls = 0;
  let releaseAgentRuns: (() => void) | null = null;

  await page.setViewportSize({ width: 1480, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });
  await seedAIStore(page, {
    activeChatId: selectedChatId,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  await page.route("**/api/getEngineConfigs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "engine-llm-fallback",
          name: "Fallback LLM",
          engineType: "setta_llm",
          settaLlmConfigId: "primary",
          externalAgentConfigId: null,
        },
        {
          id: "engine-external-authoritative",
          name: "Authoritative External",
          engineType: "external_agent",
          externalAgentConfigId: "external-config-authoritative",
          settaLlmConfigId: null,
        },
      ]),
    });
  });
  await page.route("**/api/getAgentRuns", async (route) => {
    if (releaseAgentRuns === null) {
      await new Promise<void>((resolve) => {
        releaseAgentRuns = resolve;
      });
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-selected-unknown-provenance",
          profileId: null,
          status: "completed",
          startedAt: "2026-05-10T00:00:00Z",
          finishedAt: "2026-05-10T00:00:01Z",
          events: [],
          inputs: {
            runType: "external_agent",
            projectConfigId: projectContext.projectConfigId,
            chatId: selectedChatId,
            engineConfigId: "engine-external-authoritative",
            messages: [
              {
                id: "selected-chat-user-1",
                role: "user",
                content: [{ type: "text", text: "Resume selected thread" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Selected unknown provenance thread",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
      ]),
    });
  });
  await page.route("**/api/getLLMChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === selectedChatId) {
      llmHydrateCalls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [],
        waitingForResponse: false,
        llmConfig: null,
        contextUsage: null,
      }),
    });
  });
  await page.route("**/api/getExternalAgentChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === selectedChatId) {
      externalHydrateCalls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "selected-chat-assistant",
            role: "assistant",
            content: [
              { type: "text", text: "Hydrated after provenance ready." },
            ],
          },
        ],
        waitingForResponse: false,
        toolCallArguments: {},
        contextUsage: null,
      }),
    });
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    const overviewPane = page.locator("#OverviewPane");

    await page.waitForTimeout(600);
    expect(llmHydrateCalls).toBe(0);
    expect(externalHydrateCalls).toBe(0);
    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toHaveCount(0);

    if (!releaseAgentRuns) {
      throw new Error("Expected delayed getAgentRuns request to initialize.");
    }
    releaseAgentRuns();

    await expect.poll(() => externalHydrateCalls).toBeGreaterThan(0);
    expect(llmHydrateCalls).toBe(0);
    await expect
      .poll(async () => {
        return await page.evaluate(
          async ({ activeChatId }) => {
            const { useAIStore } = await import("/src/state/definitions.ts");
            const messages =
              useAIStore.getState().chatDetails[activeChatId]?.messages;
            return (
              messages?.some((message) =>
                message.content?.some(
                  (entry) =>
                    entry.type === "text" &&
                    entry.text === "Hydrated after provenance ready.",
                ),
              ) ?? false
            );
          },
          { activeChatId: selectedChatId },
        );
      })
      .toBe(true);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai rehydrates after metadata revision changes clear a terminal hydration decision", async ({
  page,
}) => {
  const chatId = "pw-hydration-metadata-refresh";
  let externalHydrateCalls = 0;
  let agentRunsCalls = 0;

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
          id: "engine-refresh-external",
          name: "Refresh External Engine",
          engineType: "external_agent",
          externalAgentConfigId: "external-config-refresh",
          settaLlmConfigId: null,
        },
      ]),
    });
  });
  await page.route("**/api/getAgentRuns", async (route) => {
    agentRunsCalls += 1;
    const finishedAt =
      agentRunsCalls === 1 ? "2026-06-10T00:00:01Z" : "2026-06-10T00:00:05Z";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-hydration-metadata-refresh",
          profileId: null,
          status: "completed",
          startedAt: "2026-06-10T00:00:00Z",
          finishedAt,
          events: [],
          inputs: {
            runType: "external_agent",
            projectConfigId: projectContext.projectConfigId,
            chatId,
            engineConfigId: "engine-refresh-external",
            messages: [
              {
                id: "refresh-user-1",
                role: "user",
                content: [{ type: "text", text: "Resume this thread" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Metadata refresh thread",
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
    if (payload?.chatId === chatId) {
      externalHydrateCalls += 1;
      if (externalHydrateCalls === 1) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            detail: {
              errorCode: "engine_config_missing",
              message: "Chat engine config is no longer available.",
            },
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
              id: "refresh-assistant-1",
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Recovered after metadata update.",
                },
              ],
            },
          ],
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
        messages: [],
        waitingForResponse: false,
        toolCallArguments: {},
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
        llmConfig: null,
        contextUsage: null,
      }),
    });
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    const overviewPane = page.locator("#OverviewPane");
    const threadEntry = overviewPane
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Metadata refresh thread" })
      .first();
    await expect(threadEntry).toBeVisible();

    allowExpectedApiError(page, {
      path: "/api/getExternalAgentChat",
      method: "POST",
      statuses: [409],
      count: 1,
    });
    await threadEntry.click();

    await expect.poll(() => externalHydrateCalls).toBe(1);
    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toContainText("engine config is no longer available");

    await page.evaluate(async () => {
      const { loadAgentRuns } = await import("/src/state/actions/ai.ts");
      await loadAgentRuns();
    });

    await expect.poll(() => externalHydrateCalls).toBeGreaterThan(1);
    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toHaveCount(0);
    await expect(
      overviewPane.getByText("Recovered after metadata update.").first(),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai retries hydration after switching threads cancels a scheduled retry", async ({
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

  const backendOrigin =
    process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
  const engineConfigsResponse = await page.request.get(
    `${backendOrigin}/api/getEngineConfigs`,
  );
  expect(engineConfigsResponse.ok()).toBe(true);
  const engineConfigs = (await engineConfigsResponse.json()) as Array<{
    id: string;
    engineType: string;
  }>;
  if (engineConfigs.length === 0) {
    throw new Error(
      "Expected at least one engine config for hydration retry test.",
    );
  }

  const retryChatIdPrefix = "pw-hydration-retry-";
  const siblingChatIdPrefix = "pw-hydration-sibling-";
  let retryHydrateCalls = 0;
  let siblingHydrateCalls = 0;
  const failedRetryChatIds = new Set<string>();

  const buildHydrationBody = (
    endpoint: "llm" | "external",
    text: string,
  ): Record<string, unknown> => {
    if (endpoint === "external") {
      return {
        messages: [
          {
            id: `assistant-${text}`,
            role: "assistant",
            content: [{ type: "text", text }],
          },
        ],
        waitingForResponse: false,
        toolCallArguments: {},
        contextUsage: null,
      };
    }
    return {
      messages: [
        {
          id: `assistant-${text}`,
          role: "assistant",
          content: [{ type: "text", text }],
        },
      ],
      waitingForResponse: false,
      llmConfig: null,
      contextUsage: null,
    };
  };

  await page.route("**/api/getAgentRuns", async (route) => {
    const runs = engineConfigs.flatMap((config, index) => {
      const runType =
        config.engineType === "external_agent" ? "external_agent" : "llm_chat";
      const day = String(10 + index).padStart(2, "0");
      return [
        {
          id: `run-retry-${config.id}`,
          profileId: null,
          status: "completed",
          startedAt: `2026-02-${day}T00:00:00Z`,
          finishedAt: `2026-02-${day}T00:00:01Z`,
          events: [],
          inputs: {
            runType,
            projectConfigId: projectContext.projectConfigId,
            chatId: `${retryChatIdPrefix}${config.id}`,
            engineConfigId: config.id,
            messages: [
              {
                id: `retry-user-${config.id}`,
                role: "user",
                content: [{ type: "text", text: "Retry target" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Retry target thread",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
        {
          id: `run-sibling-${config.id}`,
          profileId: null,
          status: "completed",
          startedAt: `2026-02-${day}T00:00:02Z`,
          finishedAt: `2026-02-${day}T00:00:03Z`,
          events: [],
          inputs: {
            runType,
            projectConfigId: projectContext.projectConfigId,
            chatId: `${siblingChatIdPrefix}${config.id}`,
            engineConfigId: config.id,
            messages: [
              {
                id: `sibling-user-${config.id}`,
                role: "user",
                content: [{ type: "text", text: "Sibling target" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Sibling thread",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
      ];
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(runs),
    });
  });

  const handleHydrationRoute = async (
    route: Route,
    endpoint: "llm" | "external",
  ) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    const chatId = payload?.chatId ?? "";
    if (chatId.startsWith(retryChatIdPrefix)) {
      retryHydrateCalls += 1;
      if (!failedRetryChatIds.has(chatId)) {
        failedRetryChatIds.add(chatId);
        await route.abort("failed");
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildHydrationBody(endpoint, "Retry chat hydrated after returning."),
        ),
      });
      return;
    }
    if (chatId.startsWith(siblingChatIdPrefix)) {
      siblingHydrateCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildHydrationBody(endpoint, "Sibling hydrated.")),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildHydrationBody(endpoint, "Unused hydration.")),
    });
  };

  await page.route("**/api/getLLMChat", async (route) => {
    await handleHydrationRoute(route, "llm");
  });
  await page.route("**/api/getExternalAgentChat", async (route) => {
    await handleHydrationRoute(route, "external");
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    const threadsPanel = overviewPane.getByTestId("project-chat-threads-panel");
    await expect(threadsPanel).toBeVisible();

    const retryEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Retry target thread" })
      .first();
    const siblingEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Sibling thread" })
      .first();
    await expect(retryEntry).toBeVisible();
    await expect(siblingEntry).toBeVisible();

    await retryEntry.click();
    await expect.poll(() => retryHydrateCalls).toBe(1);

    await siblingEntry.click();
    await expect.poll(() => siblingHydrateCalls).toBeGreaterThan(0);

    // The first chat's retry timer should be canceled by thread switch, then recover on return.
    await page.waitForTimeout(1300);
    expect(retryHydrateCalls).toBe(1);

    await retryEntry.click();
    await expect.poll(() => retryHydrateCalls).toBeGreaterThan(1);
    await expect(
      overviewPane.getByText("Retry chat hydrated after returning.").first(),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

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
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    const threadsPanel = overviewPane.getByTestId("project-chat-threads-panel");
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
      count: 1,
    });
    await threadEntry.click();

    await expect.poll(() => terminalHydrateCalls).toBe(1);
    await page.waitForTimeout(3200);
    expect(terminalHydrateCalls).toBe(1);
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

test("project ai blocks stale selected chat ids that have no provenance", async ({
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
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    const overviewPane = page.locator("#OverviewPane");

    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toContainText("missing required provenance");
    await expect(
      overviewPane.locator('button[type="submit"]').first(),
    ).toBeDisabled();
    await page.waitForTimeout(400);
    expect(llmHydrateCalls).toBe(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai keeps stale selected chat ids unblocked while agent runs are non-authoritative", async ({
  page,
}) => {
  const staleChatId = "pw-stale-selected-chat-non-authoritative";
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
  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "agent run load failed" }),
    });
  });
  await page.route("**/api/getLLMChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === staleChatId) {
      llmHydrateCalls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "assistant-hydrated-stale",
            role: "assistant",
            content: [{ type: "text", text: "Hydrated stale selected chat." }],
          },
        ],
        waitingForResponse: false,
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
  await page.route("**/api/getExternalAgentChat", async (route) => {
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
  });

  try {
    await seedAIStore(page, {
      activeChatId: staleChatId,
    });
    allowExpectedApiError(page, {
      path: "/api/getAgentRuns",
      statuses: [500],
      count: 4,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");
    const overviewPane = page.locator("#OverviewPane");

    await expect.poll(() => llmHydrateCalls).toBeGreaterThan(0);
    await expect(
      overviewPane.getByText("Hydrated stale selected chat.").first(),
    ).toBeVisible();
    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai hydrates selected threads when engine config cache is unavailable", async ({
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
  const chatId = "pw-hydrate-unknown-engine-cache";
  let llmHydrateCalls = 0;
  let engineConfigCalls = 0;

  await page.route("**/api/getEngineConfigs", async (route) => {
    engineConfigCalls += 1;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "engine config load failed" }),
    });
  });
  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-llm-cache-unknown",
          profileId: null,
          status: "completed",
          startedAt: "2026-04-10T00:00:00Z",
          finishedAt: "2026-04-10T00:00:01Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId,
            engineConfigId: "engine-config-llm",
            messages: [
              {
                id: "seed-user",
                role: "user",
                content: [{ type: "text", text: "Hydrate me" }],
                attachments: [],
              },
            ],
          },
          outputs: {
            name: "Hydrate despite cache miss",
            nameSource: "llm",
          },
          toolCalls: [],
          cost: null,
        },
      ]),
    });
  });
  await page.route("**/api/getLLMChat", async (route) => {
    const payload = route.request().postDataJSON() as
      | { chatId?: string }
      | undefined;
    if (payload?.chatId === chatId) {
      llmHydrateCalls += 1;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "assistant-hydrated",
            role: "assistant",
            content: [{ type: "text", text: "Hydrated with unknown cache." }],
          },
        ],
        waitingForResponse: false,
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
    allowExpectedApiError(page, {
      path: "/api/getEngineConfigs",
      statuses: [500],
      count: 4,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const overviewPane = page.locator("#OverviewPane");
    const threadEntry = overviewPane
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Hydrate despite cache miss" })
      .first();
    await expect(threadEntry).toBeVisible();
    await threadEntry.click();

    await expect.poll(() => llmHydrateCalls).toBeGreaterThan(0);
    await expect.poll(() => engineConfigCalls).toBeGreaterThan(0);
    await expect(
      overviewPane.getByText("Hydrated with unknown cache.").first(),
    ).toBeVisible();
    await expect(
      overviewPane.getByTestId("project-chat-thread-blocked-banner"),
    ).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai thread history excludes runs from other projects", async ({
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
  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-project-local",
          profileId: null,
          status: "completed",
          startedAt: "2026-04-10T00:00:00Z",
          finishedAt: "2026-04-10T00:00:01Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId: "chat-local",
            engineConfigId: "engine-config-llm",
            messages: [],
          },
          outputs: { name: "Local project thread", nameSource: "llm" },
          toolCalls: [],
          cost: null,
        },
        {
          id: "run-project-foreign",
          profileId: null,
          status: "completed",
          startedAt: "2026-04-11T00:00:00Z",
          finishedAt: "2026-04-11T00:00:01Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: "foreign-project-id",
            chatId: "chat-foreign",
            engineConfigId: "engine-config-llm",
            messages: [],
          },
          outputs: { name: "Foreign project thread", nameSource: "llm" },
          toolCalls: [],
          cost: null,
        },
      ]),
    });
  });

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".react-flow__pane");

    const threadsPanel = page
      .locator("#OverviewPane")
      .getByTestId("project-chat-threads-panel");
    await expect(threadsPanel).toBeVisible();
    await expect(threadsPanel.getByText("Local project thread")).toBeVisible();
    await expect(threadsPanel.getByText("Foreign project thread")).toHaveCount(
      0,
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
