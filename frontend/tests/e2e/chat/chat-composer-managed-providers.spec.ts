import { expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  postBackend,
  setOverviewTab,
} from "../helpers";
import {
  getVisibleProjectChatSurface,
  postManagedAPIKeys,
  selectProjectAiEngine,
  startManagedAnthropicAbortableServer,
  startManagedAnthropicStandardServer,
  startManagedAnthropicThinkingServer,
  startManagedAnthropicToolCallServer,
  startManagedOpenAIAbortableChatServer,
  startManagedOpenAIChatServer,
  startManagedOpenAIChatToolCallServer,
  startManagedOpenAIResponsesThinkingServer,
  type ManagedAPIKeysSnapshot,
} from "./chat-composer-control-helpers";

type EngineConfigSummary = {
  id: string;
  name?: string;
  engineType: string;
  settaLlmConfigId?: string | null;
  externalAgentConfigId?: string | null;
  runtimeSupport?: {
    thinking?: boolean;
  } | null;
};

type LLMConfigEntry = {
  model: string;
  provider?: string | null;
  api_key_env?: string | null;
  base_url?: string | null;
  other_params?: Record<string, unknown> | null;
  mcpServerIds?: string[] | null;
  temporary?: boolean;
};

type LLMConfigPayload = {
  configs: Record<string, LLMConfigEntry>;
  mcpServers: Record<string, unknown>;
  defaultMcpServerIds: string[];
  default_config_id?: string | null;
  codexMcpImportedAt?: string | null;
};

type MCPRuntimeStatusResponse = {
  servers: Array<{
    serverId: string;
    state: string;
    endpoint: string;
  }>;
};

test.describe.serial("chat composer managed provider controls", () => {
  test("project chat enables thinking for managed Anthropic engines with backend runtime support", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    const backendOrigin =
      process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

    let createdEngineConfigId: string | null = null;
    let initialLLMConfig: LLMConfigPayload | null = null;
    let initialAPIKeysSnapshot: ManagedAPIKeysSnapshot | null = null;
    let latestAPIKeysSnapshot: ManagedAPIKeysSnapshot | null = null;
    let submittedPayload:
      | {
          thinking?: boolean;
          engineConfigId?: string;
        }
      | undefined;
    const providerServer = await startManagedAnthropicThinkingServer();

    await page.route("**/api/getLLMResponse", async (route) => {
      submittedPayload = route.request().postDataJSON() as
        | {
            thinking?: boolean;
            engineConfigId?: string;
          }
        | undefined;
      const response = await route.fetch();
      const body = await response.body();
      await route.fulfill({ response, body });
    });

    try {
      const llmConfigResponse = await page.request.get(
        `${backendOrigin}/api/llm/config`,
      );
      expect(llmConfigResponse.ok()).toBe(true);
      initialLLMConfig = (await llmConfigResponse.json()) as LLMConfigPayload;
      const apiKeysResponse = await page.request.get(
        `${backendOrigin}/api/llm/apiKeys`,
      );
      expect(apiKeysResponse.ok()).toBe(true);
      initialAPIKeysSnapshot =
        (await apiKeysResponse.json()) as ManagedAPIKeysSnapshot;
      latestAPIKeysSnapshot = initialAPIKeysSnapshot;

      const anthropicConfigId = `e2e-anthropic-thinking-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [anthropicConfigId]: {
            model: "claude-sonnet-4-5-20250929",
            provider: "anthropic",
            api_key_env: "ANTHROPIC_API_KEY",
            base_url: providerServer.origin,
            other_params: {
              max_tokens: 4096,
              thinking: {
                type: "enabled",
                budget_tokens: 1024,
              },
            },
          },
        },
      };
      await postBackend(page, "/llm/config", updatedLLMConfig);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          ANTHROPIC_API_KEY: "e2e-anthropic-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "Anthropic Thinking E2E",
          engineType: "setta_llm",
          settaLlmConfigId: anthropicConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing Anthropic thinking engine config id.");
      }

      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      const createdRuntimeSupport =
        engineConfigs.find((config) => config.id === createdEngineConfigId)
          ?.runtimeSupport ?? null;
      expect(createdRuntimeSupport?.thinking).toBe(true);

      await page.evaluate(async () => {
        const { loadEngineConfigs, loadLLMApiKeys, loadLLMConfig } =
          await import("/src/state/actions/ai.ts");
        await loadLLMConfig();
        await loadLLMApiKeys();
        await loadEngineConfigs(true);
      });

      await setOverviewTab(page, "ProjectAIChat");
      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, "Anthropic Thinking E2E");

      const thinkingButton = projectChatSurface.getByRole("button", {
        name: "Thinking",
      });
      await expect(thinkingButton).toBeVisible();
      if ((await thinkingButton.getAttribute("aria-pressed")) !== "true") {
        await thinkingButton.click();
        await expect(thinkingButton).toHaveAttribute("aria-pressed", "true");
      }

      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill("Trigger managed Anthropic thinking");
      await input.press("Enter");

      await expect.poll(() => submittedPayload?.thinking ?? null).toBe(true);
      expect(submittedPayload?.engineConfigId).toBe(createdEngineConfigId);
      await expect.poll(() => providerServer.requests.length).toBe(1);

      const providerRequest = providerServer.requests[0];
      expect(providerRequest?.path).toBe("/v1/messages");
      expect(providerRequest?.apiKey).toBe("e2e-anthropic-secret");
      expect(providerRequest?.body.model).toBe("claude-sonnet-4-5-20250929");
      expect(providerRequest?.body.max_tokens).toBe(4096);
      const thinking = providerRequest?.body.thinking as
        | Record<string, unknown>
        | undefined;
      expect(thinking?.type).toBe("enabled");
      expect(thinking?.budget_tokens).toBe(1024);
      expect(JSON.stringify(providerRequest?.body.messages ?? null)).toContain(
        "Trigger managed Anthropic thinking",
      );

      await expect(
        projectChatSurface.getByText("Anthropic answer"),
      ).toBeVisible();
      await expect(
        projectChatSurface.locator('[data-chat-thinking-section="true"]'),
      ).toContainText("Planning deeply");
    } finally {
      try {
        await setOverviewTab(page, "ProjectAIChat");
        await selectProjectAiEngine(page, "setta");
      } catch {
        // Best-effort teardown: if the test already failed, don't block cleanup.
      }
      if (createdEngineConfigId) {
        await page.request
          .post(`${backendOrigin}/api/deleteEngineConfig`, {
            data: { configId: createdEngineConfigId },
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (initialLLMConfig) {
        await page.request
          .post(`${backendOrigin}/api/llm/config`, {
            data: initialLLMConfig,
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (initialAPIKeysSnapshot && latestAPIKeysSnapshot) {
        await postManagedAPIKeys(page, {
          apiKeys: initialAPIKeysSnapshot.apiKeys,
          expectedRevision: latestAPIKeysSnapshot.revision,
        }).catch(() => {});
      }
      await providerServer.close();
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat submits standard managed Anthropic turns through the Go runtime", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    const backendOrigin =
      process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

    let createdEngineConfigId: string | null = null;
    let initialLLMConfig: LLMConfigPayload | null = null;
    let initialAPIKeysSnapshot: ManagedAPIKeysSnapshot | null = null;
    let latestAPIKeysSnapshot: ManagedAPIKeysSnapshot | null = null;
    let submittedPayload:
      | {
          thinking?: boolean;
          engineConfigId?: string;
        }
      | undefined;
    const providerServer = await startManagedAnthropicStandardServer();

    await page.route("**/api/getLLMResponse", async (route) => {
      submittedPayload = route.request().postDataJSON() as
        | {
            thinking?: boolean;
            engineConfigId?: string;
          }
        | undefined;
      const response = await route.fetch();
      const body = await response.body();
      await route.fulfill({ response, body });
    });

    try {
      const llmConfigResponse = await page.request.get(
        `${backendOrigin}/api/llm/config`,
      );
      expect(llmConfigResponse.ok()).toBe(true);
      initialLLMConfig = (await llmConfigResponse.json()) as LLMConfigPayload;
      const apiKeysResponse = await page.request.get(
        `${backendOrigin}/api/llm/apiKeys`,
      );
      expect(apiKeysResponse.ok()).toBe(true);
      initialAPIKeysSnapshot =
        (await apiKeysResponse.json()) as ManagedAPIKeysSnapshot;
      latestAPIKeysSnapshot = initialAPIKeysSnapshot;

      const anthropicConfigId = `e2e-anthropic-standard-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [anthropicConfigId]: {
            model: "claude-sonnet-4-5-20250929",
            provider: "anthropic",
            api_key_env: "ANTHROPIC_API_KEY",
            base_url: providerServer.origin,
            other_params: null,
          },
        },
      };
      await postBackend(page, "/llm/config", updatedLLMConfig);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          ANTHROPIC_API_KEY: "e2e-anthropic-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "Anthropic Standard E2E",
          engineType: "setta_llm",
          settaLlmConfigId: anthropicConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing Anthropic standard engine config id.");
      }

      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      const createdRuntimeSupport =
        engineConfigs.find((config) => config.id === createdEngineConfigId)
          ?.runtimeSupport ?? null;
      expect(createdRuntimeSupport?.thinking).toBe(false);

      await page.evaluate(async () => {
        const { loadEngineConfigs, loadLLMApiKeys, loadLLMConfig } =
          await import("/src/state/actions/ai.ts");
        await loadLLMConfig();
        await loadLLMApiKeys();
        await loadEngineConfigs(true);
      });

      await setOverviewTab(page, "ProjectAIChat");
      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, "Anthropic Standard E2E");
      await expect(
        projectChatSurface.getByRole("button", { name: "Thinking" }),
      ).toHaveCount(0);

      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill("Trigger managed Anthropic standard chat");
      await input.press("Enter");

      await expect
        .poll(() => submittedPayload?.engineConfigId ?? null)
        .toBe(createdEngineConfigId);
      expect(submittedPayload?.thinking).toBe(false);
      await expect.poll(() => providerServer.requests.length).toBe(1);

      const providerRequest = providerServer.requests[0];
      expect(providerRequest?.path).toBe("/v1/messages");
      expect(providerRequest?.apiKey).toBe("e2e-anthropic-secret");
      expect(providerRequest?.body.model).toBe("claude-sonnet-4-5-20250929");
      expect(providerRequest?.body.max_tokens).toBe(4096);
      expect(providerRequest?.body.thinking).toBeUndefined();
      expect(JSON.stringify(providerRequest?.body.messages ?? null)).toContain(
        "Trigger managed Anthropic standard chat",
      );

      await expect(
        projectChatSurface.getByText("Anthropic standard answer"),
      ).toBeVisible();
      await expect(
        projectChatSurface.locator('[data-chat-thinking-section="true"]'),
      ).toHaveCount(0);
    } finally {
      try {
        await setOverviewTab(page, "ProjectAIChat");
        await selectProjectAiEngine(page, "setta");
      } catch {
        // Best-effort teardown: if the test already failed, don't block cleanup.
      }
      if (createdEngineConfigId) {
        await page.request
          .post(`${backendOrigin}/api/deleteEngineConfig`, {
            data: { configId: createdEngineConfigId },
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (initialLLMConfig) {
        await page.request
          .post(`${backendOrigin}/api/llm/config`, {
            data: initialLLMConfig,
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (initialAPIKeysSnapshot && latestAPIKeysSnapshot) {
        await postManagedAPIKeys(page, {
          apiKeys: initialAPIKeysSnapshot.apiKeys,
          expectedRevision: latestAPIKeysSnapshot.revision,
        }).catch(() => {});
      }
      await providerServer.close();
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat stops a managed Anthropic response through the Go runtime", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    const backendOrigin =
      process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

    let createdEngineConfigId: string | null = null;
    let initialLLMConfig: LLMConfigPayload | null = null;
    let initialAPIKeysSnapshot: ManagedAPIKeysSnapshot | null = null;
    let latestAPIKeysSnapshot: ManagedAPIKeysSnapshot | null = null;
    let submittedPayload:
      | {
          thinking?: boolean;
          engineConfigId?: string;
        }
      | undefined;
    let submittedChatId: string | null = null;
    let stopOutcome:
      | {
          alreadyStopped?: boolean;
          stoppedRunId?: string | null;
          stoppedMessageId?: string | null;
        }
      | undefined;
    const providerServer = await startManagedAnthropicAbortableServer();

    await page.route("**/api/getLLMResponse", async (route) => {
      submittedPayload = route.request().postDataJSON() as
        | {
            thinking?: boolean;
            engineConfigId?: string;
          }
        | undefined;
      const response = await route.fetch();
      const body = await response.body();
      submittedChatId = JSON.parse(body.toString("utf8")) as string;
      await route.fulfill({ response, body });
    });

    await page.route("**/api/stopLLMChat", async (route) => {
      const response = await route.fetch();
      const body = await response.body();
      stopOutcome = JSON.parse(body.toString("utf8")) as
        | {
            alreadyStopped?: boolean;
            stoppedRunId?: string | null;
            stoppedMessageId?: string | null;
          }
        | undefined;
      await route.fulfill({ response, body });
    });

    try {
      const llmConfigResponse = await page.request.get(
        `${backendOrigin}/api/llm/config`,
      );
      expect(llmConfigResponse.ok()).toBe(true);
      initialLLMConfig = (await llmConfigResponse.json()) as LLMConfigPayload;
      const apiKeysResponse = await page.request.get(
        `${backendOrigin}/api/llm/apiKeys`,
      );
      expect(apiKeysResponse.ok()).toBe(true);
      initialAPIKeysSnapshot =
        (await apiKeysResponse.json()) as ManagedAPIKeysSnapshot;
      latestAPIKeysSnapshot = initialAPIKeysSnapshot;

      const anthropicConfigId = `e2e-anthropic-stop-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [anthropicConfigId]: {
            model: "claude-sonnet-4-5-20250929",
            provider: "anthropic",
            api_key_env: "ANTHROPIC_API_KEY",
            base_url: providerServer.origin,
            other_params: null,
          },
        },
      };
      await postBackend(page, "/llm/config", updatedLLMConfig);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          ANTHROPIC_API_KEY: "e2e-anthropic-stop-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "Anthropic Stop E2E",
          engineType: "setta_llm",
          settaLlmConfigId: anthropicConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing Anthropic stop engine config id.");
      }

      await page.evaluate(async () => {
        const { loadEngineConfigs, loadLLMApiKeys, loadLLMConfig } =
          await import("/src/state/actions/ai.ts");
        await loadLLMConfig();
        await loadLLMApiKeys();
        await loadEngineConfigs(true);
      });

      await setOverviewTab(page, "ProjectAIChat");
      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, "Anthropic Stop E2E");
      await expect(
        projectChatSurface.getByRole("button", { name: "Thinking" }),
      ).toHaveCount(0);

      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill("Stop this managed response.");
      await input.press("Enter");

      await expect
        .poll(() => submittedPayload?.engineConfigId ?? null)
        .toBe(createdEngineConfigId);
      expect(submittedPayload?.thinking).toBe(false);
      await expect.poll(() => providerServer.requests.length).toBe(1);
      await expect(projectChatSurface.getByText("Streaming")).toBeVisible();

      const stopButton = projectChatSurface.getByRole("button", {
        name: "Stop response",
      });
      await expect(stopButton).toBeVisible();
      await stopButton.click();

      await expect.poll(() => stopOutcome?.alreadyStopped ?? null).toBe(false);
      expect(stopOutcome?.stoppedRunId).toBeTruthy();
      expect(stopOutcome?.stoppedMessageId).toBeTruthy();
      await expect.poll(() => providerServer.abortedRequestCount).toBe(1);

      await expect
        .poll(async () => {
          if (!submittedChatId) {
            return null;
          }
          const response = await page.request.post(
            `${backendOrigin}/api/getLLMChat`,
            {
              data: {
                chatId: submittedChatId,
                projectConfigId: projectContext.projectConfigId,
              },
            },
          );
          expect(response.ok()).toBe(true);
          const payload = (await response.json()) as {
            messages: Array<Record<string, unknown>>;
            waitingForResponse: boolean;
          };
          return {
            waitingForResponse: payload.waitingForResponse,
            messageCount: payload.messages.length,
            includesStreamingText: JSON.stringify(payload.messages).includes(
              "Streaming",
            ),
          };
        })
        .toEqual({
          waitingForResponse: false,
          messageCount: 2,
          includesStreamingText: true,
        });

      const providerRequest = providerServer.requests[0];
      expect(providerRequest?.path).toBe("/v1/messages");
      expect(providerRequest?.apiKey).toBe("e2e-anthropic-stop-secret");
      expect(providerRequest?.body.model).toBe("claude-sonnet-4-5-20250929");
    } finally {
      try {
        await setOverviewTab(page, "ProjectAIChat");
        await selectProjectAiEngine(page, "setta");
      } catch {
        // Best-effort teardown: if the test already failed, don't block cleanup.
      }
      if (createdEngineConfigId) {
        await page.request
          .post(`${backendOrigin}/api/deleteEngineConfig`, {
            data: { configId: createdEngineConfigId },
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (initialLLMConfig) {
        await page.request
          .post(`${backendOrigin}/api/llm/config`, {
            data: initialLLMConfig,
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (initialAPIKeysSnapshot && latestAPIKeysSnapshot) {
        await postManagedAPIKeys(page, {
          apiKeys: initialAPIKeysSnapshot.apiKeys,
          expectedRevision: latestAPIKeysSnapshot.revision,
        }).catch(() => {});
      }
      await providerServer.close();
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat runs managed Anthropic MCP tool calls through the Go runtime", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    const backendOrigin =
      process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

    let createdEngineConfigId: string | null = null;
    let initialLLMConfig: LLMConfigPayload | null = null;
    let initialAPIKeysSnapshot: ManagedAPIKeysSnapshot | null = null;
    let latestAPIKeysSnapshot: ManagedAPIKeysSnapshot | null = null;
    let restoreCompletionGuard: (() => Promise<void>) | null = null;
    let submittedPayload:
      | {
          thinking?: boolean;
          engineConfigId?: string;
        }
      | undefined;
    const providerServer = await startManagedAnthropicToolCallServer();

    await page.route("**/api/getLLMResponse", async (route) => {
      submittedPayload = route.request().postDataJSON() as
        | {
            thinking?: boolean;
            engineConfigId?: string;
          }
        | undefined;
      const response = await route.fetch();
      const body = await response.body();
      await route.fulfill({ response, body });
    });

    try {
      restoreCompletionGuard = await setCompletionGuardEnabledForTest(
        page,
        true,
      );
      const llmConfigResponse = await page.request.get(
        `${backendOrigin}/api/llm/config`,
      );
      expect(llmConfigResponse.ok()).toBe(true);
      initialLLMConfig = (await llmConfigResponse.json()) as LLMConfigPayload;
      const apiKeysResponse = await page.request.get(
        `${backendOrigin}/api/llm/apiKeys`,
      );
      expect(apiKeysResponse.ok()).toBe(true);
      initialAPIKeysSnapshot =
        (await apiKeysResponse.json()) as ManagedAPIKeysSnapshot;
      latestAPIKeysSnapshot = initialAPIKeysSnapshot;

      const anthropicConfigId = `e2e-anthropic-tool-call-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [anthropicConfigId]: {
            model: "claude-sonnet-4-5-20250929",
            provider: "anthropic",
            api_key_env: "ANTHROPIC_API_KEY",
            base_url: providerServer.origin,
            mcpServerIds: ["setta"],
            other_params: null,
          },
        },
        mcpServers: {
          ...initialLLMConfig.mcpServers,
          setta: {
            transport: "streamable_http",
            url: `${backendOrigin}/mcp`,
          },
        },
      };
      await postBackend(page, "/llm/config", updatedLLMConfig);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          ANTHROPIC_API_KEY: "e2e-anthropic-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "Anthropic Tool Call E2E",
          engineType: "setta_llm",
          settaLlmConfigId: anthropicConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing Anthropic tool-call engine config id.");
      }

      await expect
        .poll(async () => {
          const response = await page.request.post(
            `${backendOrigin}/api/mcpServerRuntimeStatus`,
            { data: {} },
          );
          expect(response.ok()).toBe(true);
          const payload = (await response.json()) as MCPRuntimeStatusResponse;
          return (
            payload.servers.find((server) => server.serverId === "setta")
              ?.state ?? null
          );
        })
        .toBe("connected");

      await page.evaluate(async () => {
        const { loadEngineConfigs, loadLLMConfig } = await import(
          "/src/state/actions/ai.ts"
        );
        await loadLLMConfig();
        await loadEngineConfigs(true);
      });

      await setOverviewTab(page, "ProjectAIChat");
      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, "Anthropic Tool Call E2E");
      await expect(
        projectChatSurface.getByRole("button", { name: "Thinking" }),
      ).toHaveCount(0);

      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill("Report status and then respond.");
      await input.press("Enter");

      await expect
        .poll(() => submittedPayload?.engineConfigId ?? null)
        .toBe(createdEngineConfigId);
      expect(submittedPayload?.thinking).toBe(false);
      await expect.poll(() => providerServer.requests.length).toBe(2);

      const firstProviderRequest = providerServer.requests[0];
      expect(firstProviderRequest?.path).toBe("/v1/messages");
      expect(firstProviderRequest?.apiKey).toBe("e2e-anthropic-secret");
      expect(firstProviderRequest?.body.model).toBe(
        "claude-sonnet-4-5-20250929",
      );
      const firstTools = Array.isArray(firstProviderRequest?.body.tools)
        ? firstProviderRequest.body.tools
        : [];
      expect(JSON.stringify(firstTools)).toContain(
        "setta__report_completion_status",
      );

      const secondProviderRequest = providerServer.requests[1];
      const secondMessages = Array.isArray(secondProviderRequest?.body.messages)
        ? secondProviderRequest.body.messages
        : [];
      const secondMessagesJSON = JSON.stringify(secondMessages);
      expect(secondMessagesJSON).toContain('"type":"tool_use"');
      expect(secondMessagesJSON).toContain('"tool_use_id":"tool-call-1"');

      const activitySection = projectChatSurface
        .locator('[data-chat-assistant-activity-section="true"]')
        .first();
      await expect(activitySection).toBeVisible();
      await expect(activitySection).toContainText(
        "setta__report_completion_status",
      );

      const activityTrigger = activitySection.locator(
        '[data-chat-assistant-activity-trigger="true"]',
      );
      const openAllButton = activitySection.locator(
        '[data-chat-assistant-activity-open-all-button="true"]',
      );
      await activityTrigger.hover();
      await openAllButton.evaluate((element: HTMLButtonElement) => {
        element.click();
      });
      await expect(activityTrigger).toHaveAttribute("aria-expanded", "true");
      const toolItemTrigger = activitySection.locator(
        '[data-chat-tool-call-item-trigger="true"]',
      );
      await expect(toolItemTrigger).toBeVisible();
      await expect(
        activitySection.locator('[data-chat-tool-call-item="true"]'),
      ).toHaveCount(1);
      await expect(toolItemTrigger).toContainText(
        "setta__report_completion_status",
      );
      await expect(projectChatSurface).toContainText(
        "Tool-backed anthropic reply",
      );
    } finally {
      try {
        await setOverviewTab(page, "ProjectAIChat");
        await selectProjectAiEngine(page, "setta");
      } catch {
        // Best-effort teardown: if the test already failed, don't block cleanup.
      }
      if (createdEngineConfigId) {
        await page.request
          .post(`${backendOrigin}/api/deleteEngineConfig`, {
            data: { configId: createdEngineConfigId },
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (initialLLMConfig) {
        await page.request
          .post(`${backendOrigin}/api/llm/config`, {
            data: initialLLMConfig,
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (initialAPIKeysSnapshot && latestAPIKeysSnapshot) {
        await postManagedAPIKeys(page, {
          apiKeys: initialAPIKeysSnapshot.apiKeys,
          expectedRevision: latestAPIKeysSnapshot.revision,
        }).catch(() => {});
      }
      if (restoreCompletionGuard) {
        await restoreCompletionGuard().catch(() => {});
      }
      await providerServer.close();
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat submits standard managed OpenAI turns through the Go runtime", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    const backendOrigin =
      process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

    let createdEngineConfigId: string | null = null;
    let initialLLMConfig: LLMConfigPayload | null = null;
    let initialAPIKeysSnapshot: ManagedAPIKeysSnapshot | null = null;
    let latestAPIKeysSnapshot: ManagedAPIKeysSnapshot | null = null;
    let submittedPayload:
      | {
          thinking?: boolean;
          engineConfigId?: string;
        }
      | undefined;
    const providerServer = await startManagedOpenAIChatServer();

    await page.route("**/api/getLLMResponse", async (route) => {
      submittedPayload = route.request().postDataJSON() as
        | {
            thinking?: boolean;
            engineConfigId?: string;
          }
        | undefined;
      const response = await route.fetch();
      const body = await response.body();
      await route.fulfill({ response, body });
    });

    try {
      const llmConfigResponse = await page.request.get(
        `${backendOrigin}/api/llm/config`,
      );
      expect(llmConfigResponse.ok()).toBe(true);
      initialLLMConfig = (await llmConfigResponse.json()) as LLMConfigPayload;
      const apiKeysResponse = await page.request.get(
        `${backendOrigin}/api/llm/apiKeys`,
      );
      expect(apiKeysResponse.ok()).toBe(true);
      initialAPIKeysSnapshot =
        (await apiKeysResponse.json()) as ManagedAPIKeysSnapshot;
      latestAPIKeysSnapshot = initialAPIKeysSnapshot;

      const openAIConfigId = `e2e-openai-standard-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [openAIConfigId]: {
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: "OPENAI_API_KEY",
            base_url: `${providerServer.origin}/v1`,
            other_params: {
              temperature: 0.2,
            },
          },
        },
      };
      await postBackend(page, "/llm/config", updatedLLMConfig);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          OPENAI_API_KEY: "e2e-openai-standard-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "OpenAI Standard E2E",
          engineType: "setta_llm",
          settaLlmConfigId: openAIConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing OpenAI standard engine config id.");
      }

      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      const createdRuntimeSupport =
        engineConfigs.find((config) => config.id === createdEngineConfigId)
          ?.runtimeSupport ?? null;
      expect(createdRuntimeSupport?.thinking).toBe(false);

      await page.evaluate(async () => {
        const { loadEngineConfigs, loadLLMApiKeys, loadLLMConfig } =
          await import("/src/state/actions/ai.ts");
        await loadLLMConfig();
        await loadLLMApiKeys();
        await loadEngineConfigs(true);
      });

      await setOverviewTab(page, "ProjectAIChat");
      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, "OpenAI Standard E2E");
      await expect(
        projectChatSurface.getByRole("button", { name: "Thinking" }),
      ).toHaveCount(0);

      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill("Trigger managed OpenAI standard chat");
      await input.press("Enter");

      await expect
        .poll(() => submittedPayload?.engineConfigId ?? null)
        .toBe(createdEngineConfigId);
      expect(submittedPayload?.thinking).toBe(false);
      await expect.poll(() => providerServer.requests.length).toBe(1);

      const providerRequest = providerServer.requests[0];
      expect(providerRequest?.path).toBe("/v1/chat/completions");
      expect(providerRequest?.authorization).toBe(
        "Bearer e2e-openai-standard-secret",
      );
      expect(providerRequest?.body.model).toBe("gpt-4o-mini");
      expect(providerRequest?.body.temperature).toBe(0.2);
      expect(providerRequest?.body.reasoning_effort).toBeUndefined();
      expect(JSON.stringify(providerRequest?.body.messages ?? null)).toContain(
        "Trigger managed OpenAI standard chat",
      );

      await expect(
        projectChatSurface.getByText("OpenAI standard answer"),
      ).toBeVisible();
      await expect(
        projectChatSurface.locator('[data-chat-thinking-section="true"]'),
      ).toHaveCount(0);
    } finally {
      try {
        await setOverviewTab(page, "ProjectAIChat");
        await selectProjectAiEngine(page, "setta");
      } catch {
        // Best-effort teardown: if the test already failed, don't block cleanup.
      }
      if (createdEngineConfigId) {
        await page.request
          .post(`${backendOrigin}/api/deleteEngineConfig`, {
            data: { configId: createdEngineConfigId },
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (initialLLMConfig) {
        await page.request
          .post(`${backendOrigin}/api/llm/config`, {
            data: initialLLMConfig,
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (initialAPIKeysSnapshot && latestAPIKeysSnapshot) {
        await postManagedAPIKeys(page, {
          apiKeys: initialAPIKeysSnapshot.apiKeys,
          expectedRevision: latestAPIKeysSnapshot.revision,
        }).catch(() => {});
      }
      await providerServer.close();
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat stops a managed OpenAI response through the Go runtime", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    const backendOrigin =
      process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

    let createdEngineConfigId: string | null = null;
    let initialLLMConfig: LLMConfigPayload | null = null;
    let initialAPIKeysSnapshot: ManagedAPIKeysSnapshot | null = null;
    let latestAPIKeysSnapshot: ManagedAPIKeysSnapshot | null = null;
    let submittedPayload:
      | {
          thinking?: boolean;
          engineConfigId?: string;
        }
      | undefined;
    let submittedChatId: string | null = null;
    let stopOutcome:
      | {
          alreadyStopped?: boolean;
          stoppedRunId?: string | null;
          stoppedMessageId?: string | null;
        }
      | undefined;
    const providerServer = await startManagedOpenAIAbortableChatServer();

    await page.route("**/api/getLLMResponse", async (route) => {
      submittedPayload = route.request().postDataJSON() as
        | {
            thinking?: boolean;
            engineConfigId?: string;
          }
        | undefined;
      const response = await route.fetch();
      const body = await response.body();
      submittedChatId = JSON.parse(body.toString("utf8")) as string;
      await route.fulfill({ response, body });
    });

    await page.route("**/api/stopLLMChat", async (route) => {
      const response = await route.fetch();
      const body = await response.body();
      stopOutcome = JSON.parse(body.toString("utf8")) as
        | {
            alreadyStopped?: boolean;
            stoppedRunId?: string | null;
            stoppedMessageId?: string | null;
          }
        | undefined;
      await route.fulfill({ response, body });
    });

    try {
      const llmConfigResponse = await page.request.get(
        `${backendOrigin}/api/llm/config`,
      );
      expect(llmConfigResponse.ok()).toBe(true);
      initialLLMConfig = (await llmConfigResponse.json()) as LLMConfigPayload;
      const apiKeysResponse = await page.request.get(
        `${backendOrigin}/api/llm/apiKeys`,
      );
      expect(apiKeysResponse.ok()).toBe(true);
      initialAPIKeysSnapshot =
        (await apiKeysResponse.json()) as ManagedAPIKeysSnapshot;
      latestAPIKeysSnapshot = initialAPIKeysSnapshot;

      const openAIConfigId = `e2e-openai-stop-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [openAIConfigId]: {
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: "OPENAI_API_KEY",
            base_url: `${providerServer.origin}/v1`,
            other_params: {
              temperature: 0.2,
            },
          },
        },
      };
      await postBackend(page, "/llm/config", updatedLLMConfig);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          OPENAI_API_KEY: "e2e-openai-stop-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "OpenAI Stop E2E",
          engineType: "setta_llm",
          settaLlmConfigId: openAIConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing OpenAI stop engine config id.");
      }

      await page.evaluate(async () => {
        const { loadEngineConfigs, loadLLMApiKeys, loadLLMConfig } =
          await import("/src/state/actions/ai.ts");
        await loadLLMConfig();
        await loadLLMApiKeys();
        await loadEngineConfigs(true);
      });

      await setOverviewTab(page, "ProjectAIChat");
      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, "OpenAI Stop E2E");
      await expect(
        projectChatSurface.getByRole("button", { name: "Thinking" }),
      ).toHaveCount(0);

      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill("Stop this managed response.");
      await input.press("Enter");

      await expect
        .poll(() => submittedPayload?.engineConfigId ?? null)
        .toBe(createdEngineConfigId);
      expect(submittedPayload?.thinking).toBe(false);
      await expect.poll(() => providerServer.requests.length).toBe(1);
      await expect(projectChatSurface.getByText("Streaming")).toBeVisible();

      const stopButton = projectChatSurface.getByRole("button", {
        name: "Stop response",
      });
      await expect(stopButton).toBeVisible();
      await stopButton.click();

      await expect.poll(() => stopOutcome?.alreadyStopped ?? null).toBe(false);
      expect(stopOutcome?.stoppedRunId).toBeTruthy();
      expect(stopOutcome?.stoppedMessageId).toBeTruthy();
      await expect.poll(() => providerServer.abortedRequestCount).toBe(1);

      await expect
        .poll(async () => {
          if (!submittedChatId) {
            return null;
          }
          const response = await page.request.post(
            `${backendOrigin}/api/getLLMChat`,
            {
              data: {
                chatId: submittedChatId,
                projectConfigId: projectContext.projectConfigId,
              },
            },
          );
          expect(response.ok()).toBe(true);
          const payload = (await response.json()) as {
            messages: Array<Record<string, unknown>>;
            waitingForResponse: boolean;
          };
          return {
            waitingForResponse: payload.waitingForResponse,
            messageCount: payload.messages.length,
            includesStreamingText: JSON.stringify(payload.messages).includes(
              "Streaming",
            ),
          };
        })
        .toEqual({
          waitingForResponse: false,
          messageCount: 2,
          includesStreamingText: true,
        });

      const providerRequest = providerServer.requests[0];
      expect(providerRequest?.path).toBe("/v1/chat/completions");
      expect(providerRequest?.authorization).toBe(
        "Bearer e2e-openai-stop-secret",
      );
      expect(providerRequest?.body.model).toBe("gpt-4o-mini");
    } finally {
      try {
        await setOverviewTab(page, "ProjectAIChat");
        await selectProjectAiEngine(page, "setta");
      } catch {
        // Best-effort teardown: if the test already failed, don't block cleanup.
      }
      if (createdEngineConfigId) {
        await page.request
          .post(`${backendOrigin}/api/deleteEngineConfig`, {
            data: { configId: createdEngineConfigId },
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (initialLLMConfig) {
        await page.request
          .post(`${backendOrigin}/api/llm/config`, {
            data: initialLLMConfig,
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (initialAPIKeysSnapshot && latestAPIKeysSnapshot) {
        await postManagedAPIKeys(page, {
          apiKeys: initialAPIKeysSnapshot.apiKeys,
          expectedRevision: latestAPIKeysSnapshot.revision,
        }).catch(() => {});
      }
      await providerServer.close();
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat runs managed OpenAI MCP tool calls through the Go runtime", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    const backendOrigin =
      process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

    let createdEngineConfigId: string | null = null;
    let initialLLMConfig: LLMConfigPayload | null = null;
    let initialAPIKeysSnapshot: ManagedAPIKeysSnapshot | null = null;
    let latestAPIKeysSnapshot: ManagedAPIKeysSnapshot | null = null;
    let restoreCompletionGuard: (() => Promise<void>) | null = null;
    let submittedPayload:
      | {
          thinking?: boolean;
          engineConfigId?: string;
        }
      | undefined;
    const providerServer = await startManagedOpenAIChatToolCallServer();

    await page.route("**/api/getLLMResponse", async (route) => {
      submittedPayload = route.request().postDataJSON() as
        | {
            thinking?: boolean;
            engineConfigId?: string;
          }
        | undefined;
      const response = await route.fetch();
      const body = await response.body();
      await route.fulfill({ response, body });
    });

    try {
      restoreCompletionGuard = await setCompletionGuardEnabledForTest(
        page,
        true,
      );
      const llmConfigResponse = await page.request.get(
        `${backendOrigin}/api/llm/config`,
      );
      expect(llmConfigResponse.ok()).toBe(true);
      initialLLMConfig = (await llmConfigResponse.json()) as LLMConfigPayload;
      const apiKeysResponse = await page.request.get(
        `${backendOrigin}/api/llm/apiKeys`,
      );
      expect(apiKeysResponse.ok()).toBe(true);
      initialAPIKeysSnapshot =
        (await apiKeysResponse.json()) as ManagedAPIKeysSnapshot;
      latestAPIKeysSnapshot = initialAPIKeysSnapshot;

      const openAIConfigId = `e2e-openai-tool-call-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [openAIConfigId]: {
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: "OPENAI_API_KEY",
            base_url: `${providerServer.origin}/v1`,
            mcpServerIds: ["setta"],
            other_params: null,
          },
        },
        mcpServers: {
          ...initialLLMConfig.mcpServers,
          setta: {
            transport: "streamable_http",
            url: `${backendOrigin}/mcp`,
          },
        },
      };
      await postBackend(page, "/llm/config", updatedLLMConfig);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          OPENAI_API_KEY: "secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "OpenAI Tool Call E2E",
          engineType: "setta_llm",
          settaLlmConfigId: openAIConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing OpenAI tool-call engine config id.");
      }

      await expect
        .poll(async () => {
          const response = await page.request.post(
            `${backendOrigin}/api/mcpServerRuntimeStatus`,
            { data: {} },
          );
          expect(response.ok()).toBe(true);
          const payload = (await response.json()) as MCPRuntimeStatusResponse;
          return (
            payload.servers.find((server) => server.serverId === "setta")
              ?.state ?? null
          );
        })
        .toBe("connected");

      await page.evaluate(async () => {
        const { loadEngineConfigs, loadLLMConfig } = await import(
          "/src/state/actions/ai.ts"
        );
        await loadLLMConfig();
        await loadEngineConfigs(true);
      });

      await setOverviewTab(page, "ProjectAIChat");
      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, "OpenAI Tool Call E2E");

      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill("Report status and then respond.");
      await input.press("Enter");

      await expect
        .poll(() => submittedPayload?.engineConfigId ?? null)
        .toBe(createdEngineConfigId);
      expect(submittedPayload?.thinking).toBe(false);
      await expect.poll(() => providerServer.requests.length).toBe(2);

      const firstProviderRequest = providerServer.requests[0];
      expect(firstProviderRequest?.path).toBe("/v1/chat/completions");
      expect(firstProviderRequest?.authorization).toBe("Bearer secret");
      expect(firstProviderRequest?.body.model).toBe("gpt-4o-mini");
      const firstTools = Array.isArray(firstProviderRequest?.body.tools)
        ? firstProviderRequest.body.tools
        : [];
      expect(JSON.stringify(firstTools)).toContain(
        "setta__report_completion_status",
      );

      const secondProviderRequest = providerServer.requests[1];
      const secondMessages = Array.isArray(secondProviderRequest?.body.messages)
        ? secondProviderRequest.body.messages
        : [];
      expect(JSON.stringify(secondMessages)).toContain('"role":"tool"');
      expect(JSON.stringify(secondMessages)).toContain(
        '"tool_call_id":"tool-call-1"',
      );

      const activitySection = projectChatSurface
        .locator('[data-chat-assistant-activity-section="true"]')
        .first();
      await expect(activitySection).toBeVisible();
      await expect(activitySection).toContainText(
        "setta__report_completion_status",
      );

      const activityTrigger = activitySection.locator(
        '[data-chat-assistant-activity-trigger="true"]',
      );
      const openAllButton = activitySection.locator(
        '[data-chat-assistant-activity-open-all-button="true"]',
      );
      await activityTrigger.hover();
      await openAllButton.evaluate((element: HTMLButtonElement) => {
        element.click();
      });
      await expect(activityTrigger).toHaveAttribute("aria-expanded", "true");
      const toolItemTrigger = activitySection.locator(
        '[data-chat-tool-call-item-trigger="true"]',
      );
      await expect(toolItemTrigger).toBeVisible();
      await expect(
        activitySection.locator('[data-chat-tool-call-item="true"]'),
      ).toHaveCount(1);
      await expect(toolItemTrigger).toContainText(
        "setta__report_completion_status",
      );
      await expect(projectChatSurface).toContainText("Tool-backed reply");
    } finally {
      try {
        await setOverviewTab(page, "ProjectAIChat");
        await selectProjectAiEngine(page, "setta");
      } catch {
        // Best-effort teardown: if the test already failed, don't block cleanup.
      }
      if (createdEngineConfigId) {
        await page.request
          .post(`${backendOrigin}/api/deleteEngineConfig`, {
            data: { configId: createdEngineConfigId },
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (initialLLMConfig) {
        await page.request
          .post(`${backendOrigin}/api/llm/config`, {
            data: initialLLMConfig,
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (initialAPIKeysSnapshot && latestAPIKeysSnapshot) {
        await postManagedAPIKeys(page, {
          apiKeys: initialAPIKeysSnapshot.apiKeys,
          expectedRevision: latestAPIKeysSnapshot.revision,
        }).catch(() => {});
      }
      if (restoreCompletionGuard) {
        await restoreCompletionGuard().catch(() => {});
      }
      await providerServer.close();
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat enables thinking for managed OpenAI engines with backend runtime support", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    const backendOrigin =
      process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

    let createdEngineConfigId: string | null = null;
    let initialLLMConfig: LLMConfigPayload | null = null;
    let initialAPIKeysSnapshot: ManagedAPIKeysSnapshot | null = null;
    let latestAPIKeysSnapshot: ManagedAPIKeysSnapshot | null = null;
    let submittedPayload:
      | {
          thinking?: boolean;
          engineConfigId?: string;
        }
      | undefined;
    const providerServer = await startManagedOpenAIResponsesThinkingServer();

    await page.route("**/api/getLLMResponse", async (route) => {
      submittedPayload = route.request().postDataJSON() as
        | {
            thinking?: boolean;
            engineConfigId?: string;
          }
        | undefined;
      const response = await route.fetch();
      const body = await response.body();
      await route.fulfill({ response, body });
    });

    try {
      const llmConfigResponse = await page.request.get(
        `${backendOrigin}/api/llm/config`,
      );
      expect(llmConfigResponse.ok()).toBe(true);
      initialLLMConfig = (await llmConfigResponse.json()) as LLMConfigPayload;
      const apiKeysResponse = await page.request.get(
        `${backendOrigin}/api/llm/apiKeys`,
      );
      expect(apiKeysResponse.ok()).toBe(true);
      initialAPIKeysSnapshot =
        (await apiKeysResponse.json()) as ManagedAPIKeysSnapshot;
      latestAPIKeysSnapshot = initialAPIKeysSnapshot;

      const openAIConfigId = `e2e-openai-thinking-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [openAIConfigId]: {
            model: "gpt-5-codex",
            provider: "openai",
            api_key_env: "OPENAI_API_KEY",
            base_url: `${providerServer.origin}/v1`,
            other_params: {
              reasoning_effort: "high",
            },
          },
        },
      };
      await postBackend(page, "/llm/config", updatedLLMConfig);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          OPENAI_API_KEY: "e2e-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "OpenAI Thinking E2E",
          engineType: "setta_llm",
          settaLlmConfigId: openAIConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing OpenAI thinking engine config id.");
      }

      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      const createdRuntimeSupport =
        engineConfigs.find((config) => config.id === createdEngineConfigId)
          ?.runtimeSupport ?? null;
      expect(createdRuntimeSupport?.thinking).toBe(true);

      await page.evaluate(async () => {
        const { loadEngineConfigs, loadLLMApiKeys, loadLLMConfig } =
          await import("/src/state/actions/ai.ts");
        await loadLLMConfig();
        await loadLLMApiKeys();
        await loadEngineConfigs(true);
      });

      await setOverviewTab(page, "ProjectAIChat");
      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, "OpenAI Thinking E2E");

      const thinkingButton = projectChatSurface.getByRole("button", {
        name: "Thinking",
      });
      await expect(thinkingButton).toBeVisible();
      if ((await thinkingButton.getAttribute("aria-pressed")) !== "true") {
        await thinkingButton.click();
        await expect(thinkingButton).toHaveAttribute("aria-pressed", "true");
      }

      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill("Trigger managed OpenAI thinking");
      await input.press("Enter");

      await expect.poll(() => submittedPayload?.thinking ?? null).toBe(true);
      expect(submittedPayload?.engineConfigId).toBe(createdEngineConfigId);
      await expect.poll(() => providerServer.requests.length).toBe(1);

      const providerRequest = providerServer.requests[0];
      expect(providerRequest?.path).toBe("/v1/responses");
      expect(providerRequest?.authorization).toBe("Bearer e2e-secret");
      expect(providerRequest?.body.store).toBe(false);
      expect(providerRequest?.body.model).toBe("gpt-5-codex");
      const reasoning = providerRequest?.body.reasoning as
        | Record<string, unknown>
        | undefined;
      expect(reasoning?.effort).toBe("high");
      expect(reasoning?.summary).toBe("auto");
      expect(JSON.stringify(providerRequest?.body.input ?? null)).toContain(
        "Trigger managed OpenAI thinking",
      );

      await expect(projectChatSurface.getByText("Final answer")).toBeVisible();
      await expect(
        projectChatSurface.locator('[data-chat-thinking-section="true"]'),
      ).toContainText("Plan summary");
    } finally {
      try {
        await setOverviewTab(page, "ProjectAIChat");
        await selectProjectAiEngine(page, "setta");
      } catch {
        // Best-effort teardown: if the test already failed, don't block cleanup.
      }
      if (createdEngineConfigId) {
        await page.request
          .post(`${backendOrigin}/api/deleteEngineConfig`, {
            data: { configId: createdEngineConfigId },
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (initialLLMConfig) {
        await page.request
          .post(`${backendOrigin}/api/llm/config`, {
            data: initialLLMConfig,
            timeout: 5000,
          })
          .catch(() => {});
      }
      if (initialAPIKeysSnapshot && latestAPIKeysSnapshot) {
        await postManagedAPIKeys(page, {
          apiKeys: initialAPIKeysSnapshot.apiKeys,
          expectedRevision: latestAPIKeysSnapshot.revision,
        }).catch(() => {});
      }
      await providerServer.close();
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
