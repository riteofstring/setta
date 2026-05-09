import { expect, test } from "@playwright/test";
import {
  allowExpectedApiError,
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
  startManagedAzureOpenAIAbortableServer,
  startManagedAzureOpenAIChatServer,
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
  test("project chat keeps thinking disabled for managed Azure OpenAI engines without backend runtime support", async ({
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
    const providerServer = await startManagedAzureOpenAIChatServer();

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

      const azureConfigId = `e2e-azure-thinking-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [azureConfigId]: {
            model: "gpt-5-codex",
            provider: "azure",
            api_key_env: "AZURE_OPENAI_API_KEY",
            base_url: providerServer.origin,
            other_params: {
              api_version: "2024-06-01",
              reasoning_effort: "high",
            },
          },
        },
      };
      await postBackend(page, "/llm/config", updatedLLMConfig);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          AZURE_OPENAI_API_KEY: "e2e-azure-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "Azure Thinking Disabled E2E",
          engineType: "setta_llm",
          settaLlmConfigId: azureConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing Azure engine config id.");
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
      await selectProjectAiEngine(page, "Azure Thinking Disabled E2E");

      await expect(
        projectChatSurface.getByRole("button", { name: "Thinking" }),
      ).toHaveCount(0);

      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill("Trigger managed Azure chat");
      await input.press("Enter");

      await expect
        .poll(() => submittedPayload?.engineConfigId ?? null)
        .toBe(createdEngineConfigId);
      expect(submittedPayload?.thinking).toBe(false);
      await expect.poll(() => providerServer.requests.length).toBe(1);

      const providerRequest = providerServer.requests[0];
      expect(providerRequest?.path).toBe(
        "/openai/deployments/gpt-5-codex/chat/completions",
      );
      expect(providerRequest?.query).toBe("api-version=2024-06-01");
      expect(providerRequest?.apiKey).toBe("e2e-azure-secret");
      expect(providerRequest?.authorization).toBe("");
      expect(providerRequest?.body.model).toBe("gpt-5-codex");

      await expect(projectChatSurface.getByText("Azure reply")).toBeVisible();
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
      if (initialAPIKeysSnapshot) {
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

  test("project chat submits standard managed Azure OpenAI turns through the Go runtime", async ({
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
    const providerServer = await startManagedAzureOpenAIChatServer();

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

      const azureConfigId = `e2e-azure-standard-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [azureConfigId]: {
            model: "gpt-4o-mini",
            provider: "azure",
            api_key_env: "AZURE_OPENAI_API_KEY",
            base_url: providerServer.origin,
            other_params: {
              api_version: "2024-06-01",
              temperature: 0.2,
            },
          },
        },
      };
      await postBackend(page, "/llm/config", updatedLLMConfig);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          AZURE_OPENAI_API_KEY: "e2e-azure-standard-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "Azure Standard E2E",
          engineType: "setta_llm",
          settaLlmConfigId: azureConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing Azure standard engine config id.");
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
      await selectProjectAiEngine(page, "Azure Standard E2E");
      await expect(
        projectChatSurface.getByRole("button", { name: "Thinking" }),
      ).toHaveCount(0);

      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill("Trigger managed Azure OpenAI standard chat");
      await input.press("Enter");

      await expect
        .poll(() => submittedPayload?.engineConfigId ?? null)
        .toBe(createdEngineConfigId);
      expect(submittedPayload?.thinking).toBe(false);
      await expect.poll(() => providerServer.requests.length).toBe(1);

      const providerRequest = providerServer.requests[0];
      expect(providerRequest?.path).toBe(
        "/openai/deployments/gpt-4o-mini/chat/completions",
      );
      expect(providerRequest?.query).toBe("api-version=2024-06-01");
      expect(providerRequest?.apiKey).toBe("e2e-azure-standard-secret");
      expect(providerRequest?.authorization).toBe("");
      expect(providerRequest?.body.model).toBe("gpt-4o-mini");
      expect(providerRequest?.body.temperature).toBe(0.2);
      expect(providerRequest?.body.reasoning_effort).toBeUndefined();
      expect(JSON.stringify(providerRequest?.body.messages ?? null)).toContain(
        "Trigger managed Azure OpenAI standard chat",
      );

      await expect(projectChatSurface.getByText("Azure reply")).toBeVisible();
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

  test("project chat stops a managed Azure OpenAI response through the Go runtime", async ({
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
    const providerServer = await startManagedAzureOpenAIAbortableServer();

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

      const azureConfigId = `e2e-azure-stop-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [azureConfigId]: {
            model: "gpt-4o-mini",
            provider: "azure",
            api_key_env: "AZURE_OPENAI_API_KEY",
            base_url: providerServer.origin,
            other_params: {
              api_version: "2024-06-01",
              temperature: 0.2,
            },
          },
        },
      };
      await postBackend(page, "/llm/config", updatedLLMConfig);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          AZURE_OPENAI_API_KEY: "e2e-azure-stop-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "Azure Stop E2E",
          engineType: "setta_llm",
          settaLlmConfigId: azureConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing Azure stop engine config id.");
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
      await selectProjectAiEngine(page, "Azure Stop E2E");
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
      expect(providerRequest?.path).toBe(
        "/openai/deployments/gpt-4o-mini/chat/completions",
      );
      expect(providerRequest?.query).toBe("api-version=2024-06-01");
      expect(providerRequest?.apiKey).toBe("e2e-azure-stop-secret");
      expect(providerRequest?.authorization).toBe("");
      expect(providerRequest?.body.model).toBe("gpt-4o-mini");
      expect(JSON.stringify(providerRequest?.body.messages ?? null)).toContain(
        "Stop this managed response.",
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
      await providerServer.close();
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat rolls back optimistic drafts when a managed provider is unsupported", async ({
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

    try {
      const llmConfigResponse = await page.request.get(
        `${backendOrigin}/api/llm/config`,
      );
      expect(llmConfigResponse.ok()).toBe(true);
      initialLLMConfig = (await llmConfigResponse.json()) as LLMConfigPayload;

      const unsupportedConfigId = `e2e-unsupported-provider-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [unsupportedConfigId]: {
            model: "mistral-large-latest",
            provider: "mistral",
          },
        },
      };
      await postBackend(page, "/llm/config", updatedLLMConfig);

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "Unsupported Provider E2E",
          engineType: "setta_llm",
          settaLlmConfigId: unsupportedConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing unsupported provider engine config id.");
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
      await selectProjectAiEngine(page, "Unsupported Provider E2E");

      allowExpectedApiError(page, {
        path: "/api/getLLMResponse",
        statuses: [400],
        method: "POST",
        count: 1,
      });

      const submittedText = "Trigger unsupported managed provider";
      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill(submittedText);
      await input.press("Enter");

      await expect
        .poll(async () => {
          return page.evaluate(
            async ({ expectedText, notificationText }) => {
              const { useAIStore, useNotifications } = await import(
                "/src/state/definitions.ts"
              );

              const pendingMessages = Object.values(
                useAIStore.getState().pendingChatDetailsBySurfaceId,
              ).flatMap((details) =>
                details.messages.map((message) =>
                  JSON.stringify(message.content),
                ),
              );
              const hydratedMessages = Object.values(
                useAIStore.getState().chatDetails,
              ).flatMap((details) =>
                details.messages.map((message) =>
                  JSON.stringify(message.content),
                ),
              );
              const notifications = useNotifications.getState().notifications;

              return {
                hasExpectedWarning: notifications.some(
                  (notification) =>
                    notification.message === notificationText &&
                    notification.type === "warning",
                ),
                pendingContainsText: pendingMessages.some((content) =>
                  content.includes(expectedText),
                ),
                hydratedContainsText: hydratedMessages.some((content) =>
                  content.includes(expectedText),
                ),
              };
            },
            {
              expectedText: submittedText,
              notificationText:
                'managed llm provider is not supported: "mistral"',
            },
          );
        })
        .toEqual({
          hasExpectedWarning: true,
          pendingContainsText: false,
          hydratedContainsText: false,
        });
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
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat rolls back optimistic drafts when managed Azure config is invalid", async ({
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
    let observedError: {
      status: number;
      code: string | null;
      message: string | null;
    } | null = null;

    await page.route("**/api/getLLMResponse", async (route) => {
      const response = await route.fetch();
      const body = await response.body();
      let payload: unknown = null;
      try {
        payload = JSON.parse(body.toString("utf-8")) as unknown;
      } catch {
        payload = null;
      }
      if (response.status() >= 400) {
        const record =
          payload && typeof payload === "object"
            ? (payload as {
                error?: { code?: unknown; message?: unknown };
              })
            : null;
        observedError = {
          status: response.status(),
          code:
            typeof record?.error?.code === "string" ? record.error.code : null,
          message:
            typeof record?.error?.message === "string"
              ? record.error.message
              : null,
        };
      }
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

      const invalidAzureConfigId = `e2e-invalid-azure-provider-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [invalidAzureConfigId]: {
            model: "gpt-4o-mini",
            provider: "azure",
            api_key_env: "AZURE_OPENAI_API_KEY",
            base_url: "https://example-resource.openai.azure.com",
            other_params: {},
          },
        },
      };
      await postBackend(page, "/llm/config", updatedLLMConfig);
      await page.request.post(`${backendOrigin}/api/llm/apiKeys`, {
        data: {
          apiKeys: {
            ...initialAPIKeysSnapshot.apiKeys,
            AZURE_OPENAI_API_KEY: "e2e-azure-secret",
          },
          expectedRevision: initialAPIKeysSnapshot.revision,
        },
      });

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "Invalid Azure Provider E2E",
          engineType: "setta_llm",
          settaLlmConfigId: invalidAzureConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing invalid Azure engine config id.");
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
      await selectProjectAiEngine(page, "Invalid Azure Provider E2E");

      allowExpectedApiError(page, {
        path: "/api/getLLMResponse",
        statuses: [400],
        method: "POST",
        count: 1,
      });

      const submittedText = "Trigger invalid Azure provider config";
      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill(submittedText);
      await input.press("Enter");

      await expect
        .poll(() => observedError)
        .toEqual({
          status: 400,
          code: "provider_config_invalid",
          message:
            "managed llm provider config is invalid: azure provider requires explicit api_version",
        });
      await expect
        .poll(async () => {
          return page.evaluate(async (expectedText) => {
            const { useAIStore } = await import("/src/state/definitions.ts");

            const pendingMessages = Object.values(
              useAIStore.getState().pendingChatDetailsBySurfaceId,
            ).flatMap((details) =>
              details.messages.map((message) =>
                JSON.stringify(message.content),
              ),
            );
            const hydratedMessages = Object.values(
              useAIStore.getState().chatDetails,
            ).flatMap((details) =>
              details.messages.map((message) =>
                JSON.stringify(message.content),
              ),
            );

            return {
              pendingContainsText: pendingMessages.some((content) =>
                content.includes(expectedText),
              ),
              hydratedContainsText: hydratedMessages.some((content) =>
                content.includes(expectedText),
              ),
            };
          }, submittedText);
        })
        .toEqual({
          pendingContainsText: false,
          hydratedContainsText: false,
        });
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
      if (initialAPIKeysSnapshot) {
        const currentApiKeysResponse = await page.request
          .get(`${backendOrigin}/api/llm/apiKeys`, {
            timeout: 5000,
          })
          .catch(() => null);
        if (currentApiKeysResponse?.ok()) {
          const currentApiKeysSnapshot =
            (await currentApiKeysResponse.json()) as ManagedAPIKeysSnapshot;
          await page.request
            .post(`${backendOrigin}/api/llm/apiKeys`, {
              data: {
                apiKeys: initialAPIKeysSnapshot.apiKeys,
                expectedRevision: currentApiKeysSnapshot.revision,
              },
              timeout: 5000,
            })
            .catch(() => {});
        }
      }
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat rolls back optimistic drafts when cached managed thinking support turns stale", async ({
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
    let observedError: {
      status: number;
      code: string | null;
      message: string | null;
    } | null = null;
    let submittedPayload:
      | {
          thinking?: boolean;
          engineConfigId?: string;
        }
      | undefined;

    await page.route("**/api/getLLMResponse", async (route) => {
      submittedPayload = route.request().postDataJSON() as
        | {
            thinking?: boolean;
            engineConfigId?: string;
          }
        | undefined;
      const response = await route.fetch();
      const body = await response.body();
      let payload: unknown = null;
      try {
        payload = JSON.parse(body.toString("utf-8")) as unknown;
      } catch {
        payload = null;
      }
      if (response.status() >= 400) {
        const record =
          payload && typeof payload === "object"
            ? (payload as {
                error?: { code?: unknown; message?: unknown };
              })
            : null;
        observedError = {
          status: response.status(),
          code:
            typeof record?.error?.code === "string" ? record.error.code : null,
          message:
            typeof record?.error?.message === "string"
              ? record.error.message
              : null,
        };
      }
      await route.fulfill({ response, body });
    });

    try {
      const llmConfigResponse = await page.request.get(
        `${backendOrigin}/api/llm/config`,
      );
      expect(llmConfigResponse.ok()).toBe(true);
      initialLLMConfig = (await llmConfigResponse.json()) as LLMConfigPayload;

      const staleThinkingConfigId = `e2e-stale-thinking-${Date.now()}`;
      const llmConfigWithThinkingSupport: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [staleThinkingConfigId]: {
            model: "gpt-4o-mini",
            provider: "openai",
            other_params: {
              reasoning_effort: "high",
            },
          },
        },
      };
      await postBackend(page, "/llm/config", llmConfigWithThinkingSupport);

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "Stale Managed Thinking E2E",
          engineType: "setta_llm",
          settaLlmConfigId: staleThinkingConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing stale managed thinking engine config id.");
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
      await selectProjectAiEngine(page, "Stale Managed Thinking E2E");

      const thinkingButton = projectChatSurface.getByRole("button", {
        name: "Thinking",
      });
      await expect(thinkingButton).toBeVisible();
      if ((await thinkingButton.getAttribute("aria-pressed")) !== "true") {
        await thinkingButton.click();
        await expect(thinkingButton).toHaveAttribute("aria-pressed", "true");
      }

      const llmConfigWithoutThinkingSupport: LLMConfigPayload = {
        ...llmConfigWithThinkingSupport,
        configs: {
          ...llmConfigWithThinkingSupport.configs,
          [staleThinkingConfigId]: {
            model: "gpt-4o-mini",
            provider: "openai",
            other_params: {},
          },
        },
      };
      await postBackend(page, "/llm/config", llmConfigWithoutThinkingSupport);

      await expect(thinkingButton).toBeVisible();
      await expect(thinkingButton).toHaveAttribute("aria-pressed", "true");

      allowExpectedApiError(page, {
        path: "/api/getLLMResponse",
        statuses: [400],
        method: "POST",
        count: 1,
      });

      const submittedText = "Trigger stale managed thinking support";
      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill(submittedText);
      await input.press("Enter");

      await expect.poll(() => submittedPayload?.thinking ?? null).toBe(true);
      expect(submittedPayload?.engineConfigId).toBe(createdEngineConfigId);
      await expect
        .poll(() => observedError)
        .toEqual({
          status: 400,
          code: "thinking_unsupported",
          message:
            'managed llm reasoning is not supported without explicit provider-native config: thinking is not supported for model "gpt-4o-mini" via provider "openai"',
        });
      await expect
        .poll(async () => {
          return page.evaluate(async (expectedText) => {
            const { useAIStore } = await import("/src/state/definitions.ts");

            const pendingMessages = Object.values(
              useAIStore.getState().pendingChatDetailsBySurfaceId,
            ).flatMap((details) =>
              details.messages.map((message) =>
                JSON.stringify(message.content),
              ),
            );
            const hydratedMessages = Object.values(
              useAIStore.getState().chatDetails,
            ).flatMap((details) =>
              details.messages.map((message) =>
                JSON.stringify(message.content),
              ),
            );

            return {
              pendingContainsText: pendingMessages.some((content) =>
                content.includes(expectedText),
              ),
              hydratedContainsText: hydratedMessages.some((content) =>
                content.includes(expectedText),
              ),
            };
          }, submittedText);
        })
        .toEqual({
          pendingContainsText: false,
          hydratedContainsText: false,
        });
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
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
