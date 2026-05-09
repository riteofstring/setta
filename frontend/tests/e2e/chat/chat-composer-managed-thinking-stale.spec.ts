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
  selectProjectAiEngine,
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

test.describe.serial("chat composer stale managed thinking support", () => {
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
