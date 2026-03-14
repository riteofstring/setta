import { expect, test, type Locator, type Page } from "@playwright/test";
import * as http from "node:http";
import {
  allowExpectedApiError,
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
  setChatSectionState,
  setOverviewTab,
} from "../helpers";

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

type ManagedAPIKeysSnapshot = {
  apiKeys: Record<string, string>;
  revision: number;
  corrupt?: boolean;
  errorCode?: string | null;
  message?: string | null;
};

type MCPRuntimeStatusResponse = {
  servers: Array<{
    serverId: string;
    state: string;
    endpoint: string;
  }>;
};

type ManagedOpenAIResponsesProviderRequest = {
  path: string;
  authorization: string;
  body: Record<string, unknown>;
};

type ManagedOpenAIResponsesProviderServer = {
  origin: string;
  requests: ManagedOpenAIResponsesProviderRequest[];
  close: () => Promise<void>;
};

type ManagedOpenAIChatProviderRequest = {
  path: string;
  authorization: string;
  body: Record<string, unknown>;
};

type ManagedOpenAIChatProviderServer = {
  origin: string;
  requests: ManagedOpenAIChatProviderRequest[];
  close: () => Promise<void>;
};

type ManagedOpenAIAbortableChatProviderServer = {
  origin: string;
  requests: ManagedOpenAIChatProviderRequest[];
  abortedRequestCount: number;
  close: () => Promise<void>;
};

type ManagedGeminiThinkingProviderRequest = {
  path: string;
  query: string;
  apiKey: string;
  body: Record<string, unknown>;
};

type ManagedGeminiThinkingProviderServer = {
  origin: string;
  requests: ManagedGeminiThinkingProviderRequest[];
  close: () => Promise<void>;
};

type ManagedGeminiStandardProviderRequest = {
  path: string;
  query: string;
  apiKey: string;
  body: Record<string, unknown>;
};

type ManagedGeminiStandardProviderServer = {
  origin: string;
  requests: ManagedGeminiStandardProviderRequest[];
  close: () => Promise<void>;
};

type ManagedGeminiAbortableProviderServer = {
  origin: string;
  requests: ManagedGeminiStandardProviderRequest[];
  abortedRequestCount: number;
  close: () => Promise<void>;
};

type ManagedAnthropicThinkingProviderRequest = {
  path: string;
  apiKey: string;
  body: Record<string, unknown>;
};

type ManagedAnthropicThinkingProviderServer = {
  origin: string;
  requests: ManagedAnthropicThinkingProviderRequest[];
  close: () => Promise<void>;
};

type ManagedAnthropicStandardProviderRequest = {
  path: string;
  apiKey: string;
  body: Record<string, unknown>;
};

type ManagedAnthropicStandardProviderServer = {
  origin: string;
  requests: ManagedAnthropicStandardProviderRequest[];
  close: () => Promise<void>;
};

type ManagedAnthropicAbortableProviderServer = {
  origin: string;
  requests: ManagedAnthropicStandardProviderRequest[];
  abortedRequestCount: number;
  close: () => Promise<void>;
};

type ManagedAzureChatProviderRequest = {
  path: string;
  query: string;
  apiKey: string;
  authorization: string;
  body: Record<string, unknown>;
};

type ManagedAzureChatProviderServer = {
  origin: string;
  requests: ManagedAzureChatProviderRequest[];
  close: () => Promise<void>;
};

type ManagedAzureAbortableChatProviderServer = {
  origin: string;
  requests: ManagedAzureChatProviderRequest[];
  abortedRequestCount: number;
  close: () => Promise<void>;
};

test.describe.serial("chat composer controls", () => {
  test("chat sections keep a compact composer with no inline settings controls", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    let llmSubmitCount = 0;
    await page.route("**/api/getLLMResponse", async (route) => {
      llmSubmitCount += 1;
      await route.continue();
    });

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_composer__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "msg-existing",
              role: "user",
              content: [{ type: "text", text: "Existing thread message" }],
              attachments: [],
            },
          ],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
          activeBranchId: null,
          branches: {},
        },
      });

      await expect(section.getByText("Existing thread message")).toHaveCount(1);
      await expect(section.getByRole("button", { name: "/new" })).toHaveCount(
        0,
      );
      await expect(
        section.getByRole("button", { name: "/resume" }),
      ).toHaveCount(0);
      await expect(
        section.getByRole("button", { name: "Summarize Codebase" }),
      ).toHaveCount(0);
      await expect(
        section.getByRole("button", { name: "Create Project" }),
      ).toHaveCount(0);

      const input = section.locator("textarea").first();
      const sectionBox = await section.boundingBox();
      const inputBox = await input.boundingBox();
      if (!sectionBox || !inputBox) {
        throw new Error("Expected visible chat section and composer bounds.");
      }
      expect(inputBox.width).toBeGreaterThan(sectionBox.width * 0.45);
      await input.fill("/resume");
      const sectionSuggestions = page
        .locator("div.fixed.z-40.overflow-y-auto")
        .filter({ hasText: "/resume" })
        .first();
      await expect(sectionSuggestions).toBeVisible();
      await expect(sectionSuggestions).toHaveClass(/overflow-x-hidden/);
      const resumeSuggestion = sectionSuggestions
        .locator("button")
        .filter({ hasText: "Resume the latest chat thread." })
        .first();
      await expect(resumeSuggestion).toBeVisible();
      await input.press("Enter");
      await expect
        .poll(async () => {
          const text = await section.textContent();
          return Boolean(
            text?.includes("No previous branch found to resume.") ||
              text?.includes("Resumed the latest branch."),
          );
        })
        .toBe(true);
      await input.fill("/search off");
      await input.press("Enter");
      await expect(
        section.getByText(
          "/search is unavailable in the current context. Use /help.",
        ),
      ).toBeVisible();
      await input.fill("/permissions yolo");
      await input.press("Enter");
      await expect(
        section.getByText(
          "/permissions is unavailable in the current context. Use /help.",
        ),
      ).toBeVisible();
      expect(llmSubmitCount).toBe(0);

      await expect(
        section.getByRole("button", { name: /permissions$/i }),
      ).toHaveCount(0);
      await expect(section.getByRole("button", { name: "Search" })).toHaveCount(
        0,
      );
      await expect(section.getByRole("button", { name: "Skills" })).toHaveCount(
        0,
      );
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("managed chat sections keep thread actions in-chat and hide inline settings controls", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_managed_chat_threads_ui__",
      );
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        managed: true,
        engineConfigId: null,
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      await expect(
        section.getByRole("button", { name: "History" }),
      ).toBeVisible();
      await expect(
        section.getByRole("button", { name: "New Chat" }),
      ).toBeVisible();
      await expect(
        section.getByRole("button", { name: /permissions$/i }),
      ).toHaveCount(0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("managed chat sections hide thread controls when deployment policy disallows LLM access", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const preview = await mountManagedChatAreaForSharePolicy(page, {
      allowLLM: false,
    });

    await expect(preview).toBeVisible();
    await expect(preview.getByRole("button", { name: "History" })).toHaveCount(
      0,
    );
    await expect(preview.getByRole("button", { name: "New Chat" })).toHaveCount(
      0,
    );
    await expect(preview.locator("textarea").first()).toBeDisabled();
  });

  test("managed section zero-scope banner is dismissible per browser session", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_managed_zero_scope_banner__",
      );
      const applySettings = async (managed: boolean) => {
        await postBackend(page, "/setChatSectionSettings", {
          projectConfigId: projectContext.projectConfigId,
          sectionId,
          managed,
          engineConfigId: null,
          transcriptionProfileId: null,
          agentProfileId: null,
          thinking: false,
          permissionMode: "minimal",
          searchEnabled: true,
          dictationMode: "auto",
        });
      };
      await applySettings(true);

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      const zeroScopeBanner = section.getByText(
        "No outgoing scope links. This chat has no project access.",
      );
      const zeroScopeIndicator = section.getByTestId(
        "managed-chat-zero-scope-indicator",
      );
      await expect(zeroScopeIndicator).toBeVisible();
      await expect(zeroScopeBanner).toBeVisible();

      const dismissButton = section.getByRole("button", { name: "Dismiss" });
      await dismissButton.focus();
      await dismissButton.press("Enter");
      await expect(zeroScopeBanner).toHaveCount(0);
      const dismissalStorageKey = `setta:managed-zero-scope-banner-dismissed:${projectContext.projectConfigId}:${sectionId}`;
      await expect
        .poll(
          async () =>
            await page.evaluate(
              (storageKey) => window.sessionStorage.getItem(storageKey),
              dismissalStorageKey,
            ),
        )
        .toBe("1");

      await applySettings(false);
      await expect(
        section.getByRole("button", { name: "History" }),
      ).toHaveCount(0);
      await applySettings(true);
      await expect(
        section.getByRole("button", { name: "History" }),
      ).toBeVisible();
      await expect(zeroScopeIndicator).toBeVisible();
      await expect(zeroScopeBanner).toHaveCount(0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("canvas section chat mode switch updates section rendering between section and project-ai modes", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { Chat: "SectionConfig" },
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    await ensureManagedChatEngine(page);
    const instanceId = "project-chat-window-mode-switch";

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_canvas_chat_mode_switch__",
      );
      await expect
        .poll(
          async () =>
            await page.evaluate(async () => {
              const { useAIStore } = await import("/src/state/definitions.ts");
              const engine =
                useAIStore
                  .getState()
                  .engineConfigs.find(
                    (config) => config.engineType === "setta_llm",
                  ) ?? null;
              if (!engine) {
                return null;
              }
              return `${engine.id}:${engine.name}`;
            }),
        )
        .not.toBeNull();
      const managedEngine = await page.evaluate(async () => {
        const { useAIStore } = await import("/src/state/definitions.ts");
        const engine =
          useAIStore
            .getState()
            .engineConfigs.find(
              (config) => config.engineType === "setta_llm",
            ) ?? null;
        if (!engine) {
          return null;
        }
        return { id: engine.id, name: engine.name };
      });
      if (!managedEngine) {
        throw new Error(
          "Missing managed setta_llm engine for mode switch test.",
        );
      }
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        managed: true,
        engineConfigId: managedEngine.id,
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });

      const llmRequests: Array<{
        sectionId: string | null;
        allowUnscoped: boolean | null;
      }> = [];
      await page.route("**/api/getLLMResponse", async (route) => {
        const payload = route.request().postDataJSON() as {
          sectionId?: string | null;
          allowUnscoped?: boolean;
        };
        llmRequests.push({
          sectionId:
            typeof payload.sectionId === "string" ? payload.sectionId : null,
          allowUnscoped:
            typeof payload.allowUnscoped === "boolean"
              ? payload.allowUnscoped
              : null,
        });
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(`pw-chat-mode-scope-${llmRequests.length}`),
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
              id: "llm-e2e",
              model: "gpt-4o-mini",
              provider: "openai",
              api_key_env: null,
              base_url: null,
              other_params: {},
              mcpServerIds: [],
              temporary: false,
            },
            contextUsage: null,
          }),
        });
      });

      const setCanvasSectionBinding = async (
        mode: "section_mode" | "project_ai_mode",
      ) => {
        const nextWindowingState = {
          instancesById: {
            [instanceId]: {
              instanceId,
              placement: "canvas_section",
              isMinimized: false,
              isClosed: false,
              isMaximized: false,
              bounds: {
                x: 120,
                y: 120,
                width: 820,
                height: 520,
              },
              dockMetrics: {
                widthFraction: null,
                preferredWidthPx: null,
              },
              zIndex: 1,
              lastPlacementBeforeMaximize: null,
              mode,
              sectionIdOrNull: sectionId,
              lastFocusedAt: Date.now(),
              chatId: null,
            },
          },
          order: [instanceId],
          nextInstanceNumber: 2,
        };
        await page.evaluate(async (windowingState) => {
          const { useProjectState } = await import("/src/state/definitions.ts");
          useProjectState.setState((state) => {
            state.projectChatWindowing = windowingState;
          });
        }, nextWindowingState);
        await postBackend(page, "/setProjectChatWindowingState", {
          projectConfigId: projectContext.projectConfigId,
          state: nextWindowingState,
        });
      };
      const expectCanvasBindingForSection = async () => {
        await expect
          .poll(
            async () =>
              await page.evaluate(async (targetInstanceId) => {
                const { useProjectState } = await import(
                  "/src/state/definitions.ts"
                );
                const target =
                  useProjectState.getState().projectChatWindowing.instancesById[
                    targetInstanceId
                  ];
                if (!target) {
                  return null;
                }
                return target.sectionIdOrNull;
              }, instanceId),
          )
          .toBe(sectionId);
      };

      await setCanvasSectionBinding("section_mode");
      await expectCanvasBindingForSection();

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      const surface = section
        .locator('[data-chat-surface-host="section_layout"]')
        .first();
      await expect(surface).toHaveAttribute(
        "data-chat-surface-mode",
        "section_mode",
      );
      await setCanvasSectionBinding("project_ai_mode");
      await expectCanvasBindingForSection();

      await expect(surface).toHaveAttribute(
        "data-chat-surface-mode",
        "project_ai_mode",
      );
      await surface
        .getByRole("button", { name: "Project AI Settings" })
        .click();
      const projectModeEngineInput = page.getByPlaceholder("Select an engine");
      await expect(projectModeEngineInput).toBeVisible();
      await projectModeEngineInput.fill(managedEngine.name);
      await projectModeEngineInput.press("Enter");
      await page.keyboard.press("Escape");
      const projectModeInput = surface.locator("textarea").first();
      await projectModeInput.fill("project-ai unscoped request");
      await projectModeInput.press("Enter");
      await expect.poll(() => llmRequests.length).toBe(1);
      expect(llmRequests[0]).toEqual({
        sectionId: null,
        allowUnscoped: true,
      });
      await setCanvasSectionBinding("section_mode");
      await expectCanvasBindingForSection();
      await expect(surface).toHaveAttribute(
        "data-chat-surface-mode",
        "section_mode",
      );
      const restoredScopedInput = surface.locator("textarea").first();
      await restoredScopedInput.fill("section-mode restored scope request");
      await restoredScopedInput.press("Enter");
      await expect.poll(() => llmRequests.length).toBe(2);
      expect(llmRequests[1]).toEqual({
        sectionId,
        allowUnscoped: false,
      });
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("canvas-created chat sections can switch to project-ai mode from section config before any window binding exists", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { Chat: "SectionConfig" },
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_canvas_chat_mode_direct__",
      );
      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      const surface = section
        .locator('[data-chat-surface-host="section_layout"]')
        .first();
      await expect(surface).toHaveAttribute(
        "data-chat-surface-mode",
        "section_mode",
      );

      await section.click();

      const uiEditorPane = page.locator("#UiEditorPane");
      await expect(uiEditorPane).toBeVisible();
      const modeBlock = uiEditorPane.getByTestId(
        "chat-area-settings-chat-mode",
      );
      await expect(modeBlock).toBeVisible();
      await expect(
        modeBlock.getByPlaceholder("Select chat mode"),
      ).toBeVisible();

      await modeBlock.getByRole("button").click();
      await page
        .getByText("Project AI mode (full project)", { exact: true })
        .click();

      await expect(surface).toHaveAttribute(
        "data-chat-surface-mode",
        "project_ai_mode",
      );
      await expect
        .poll(
          async () =>
            await page.evaluate(async (nextSectionId) => {
              const { useProjectState } = await import(
                "/src/state/definitions.ts"
              );
              const instance = Object.values(
                useProjectState.getState().projectChatWindowing.instancesById,
              ).find(
                (candidate) => candidate.sectionIdOrNull === nextSectionId,
              );
              if (!instance) {
                return null;
              }
              return {
                placement: instance.placement,
                mode: instance.mode,
              };
            }, sectionId),
        )
        .toEqual({
          placement: "canvas_section",
          mode: "project_ai_mode",
        });
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat shows starter controls with visible slash menu and full execution footer", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    let llmSubmitCount = 0;
    await page.route("**/api/getLLMResponse", async (route) => {
      llmSubmitCount += 1;
      await route.continue();
    });

    try {
      await page.reload();
      await page.waitForSelector(".react-flow__pane");
      await setOverviewTab(page, "ProjectAIChat");

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();
      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, "setta");

      await expect(
        projectChatSurface.getByRole("button", { name: "/new" }),
      ).toHaveCount(0);
      await expect(
        projectChatSurface.getByRole("button", { name: "/resume" }),
      ).toHaveCount(0);
      await expect(
        projectChatSurface.getByRole("button", { name: "/model" }),
      ).toHaveCount(0);
      await expect(
        projectChatSurface.getByRole("button", { name: /^Create Project UI$/ }),
      ).toHaveCount(0);
      const createProjectButton = projectChatSurface.getByRole("button", {
        name: /^Create Project$/,
      });
      await expect(createProjectButton).toBeVisible();
      const summarizeCodebaseButton = projectChatSurface.getByRole("button", {
        name: /^Summarize Codebase$/,
      });
      await expect(summarizeCodebaseButton).toBeVisible();
      const planNextStepsButton = projectChatSurface.getByRole("button", {
        name: /^Plan Next Steps$/,
      });
      await expect(planNextStepsButton).toBeVisible();
      const quickActionButtons: Locator[] = [
        createProjectButton,
        summarizeCodebaseButton,
        planNextStepsButton,
      ];
      await expectButtonsStackedVertically(quickActionButtons);

      const firstButtonClass =
        await quickActionButtons[0]?.getAttribute("class");
      const secondButtonClass =
        await quickActionButtons[1]?.getAttribute("class");
      expect(firstButtonClass).toBeTruthy();
      expect(firstButtonClass).toBe(secondButtonClass);

      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill("/res");
      const projectSuggestions = page
        .locator("div.fixed.z-40.overflow-y-auto")
        .filter({ hasText: "/resume" })
        .first();
      await expect(projectSuggestions).toBeVisible();
      await expect(projectSuggestions).toHaveClass(/overflow-x-hidden/);
      const resumeSuggestion = projectSuggestions
        .locator("button")
        .filter({ hasText: "Resume the latest chat thread." })
        .first();
      await expect(resumeSuggestion).toBeVisible();
      const inputBox = await input.boundingBox();
      const suggestionBox = await resumeSuggestion.boundingBox();
      if (!inputBox || !suggestionBox) {
        throw new Error("Missing slash suggestion geometry.");
      }
      const suggestionBottom = suggestionBox.y + suggestionBox.height;
      const inputBottom = inputBox.y + inputBox.height;
      const isAboveInput = suggestionBottom <= inputBox.y + 2;
      const isBelowInput = suggestionBox.y >= inputBottom - 2;
      expect(isAboveInput || isBelowInput).toBe(true);

      const submitButton = projectChatSurface
        .locator('button[type="submit"]')
        .first();
      await input.fill("/res");
      await submitButton.click();
      await expect
        .poll(async () => {
          const text = await projectChatSurface.textContent();
          return Boolean(
            text?.includes("No previous project chat found to resume.") ||
              text?.includes("Resumed the latest project chat."),
          );
        })
        .toBe(true);
      expect(llmSubmitCount).toBe(0);

      await input.fill("/Resume");
      await submitButton.click();
      await expect
        .poll(async () => {
          const text = await projectChatSurface.textContent();
          return Boolean(
            text?.includes("No previous project chat found to resume.") ||
              text?.includes("Resumed the latest project chat."),
          );
        })
        .toBe(true);
      expect(llmSubmitCount).toBe(0);

      await expect(
        projectChatSurface.getByRole("button", { name: /permissions$/i }),
      ).toBeVisible();
      const searchButton = projectChatSurface.getByRole("button", {
        name: "Search",
      });
      await expect(searchButton).toHaveCount(0);
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

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

      await expect
        .poll(() => stopOutcome?.alreadyStopped ?? null)
        .toBe(false);
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
            transport: "sse",
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
          const payload =
            (await response.json()) as MCPRuntimeStatusResponse;
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
      expect(firstProviderRequest?.body.model).toBe("claude-sonnet-4-5-20250929");
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
      await expect(activitySection).toContainText("setta__report_completion_status");

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
      await expect(projectChatSurface).toContainText("Tool-backed anthropic reply");
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

      await expect
        .poll(() => stopOutcome?.alreadyStopped ?? null)
        .toBe(false);
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
            transport: "sse",
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
          const payload =
            (await response.json()) as MCPRuntimeStatusResponse;
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
      expect(JSON.stringify(firstTools)).toContain("setta__report_completion_status");

      const secondProviderRequest = providerServer.requests[1];
      const secondMessages = Array.isArray(secondProviderRequest?.body.messages)
        ? secondProviderRequest.body.messages
        : [];
      expect(JSON.stringify(secondMessages)).toContain('"role":"tool"');
      expect(JSON.stringify(secondMessages)).toContain('"tool_call_id":"tool-call-1"');

      const activitySection = projectChatSurface
        .locator('[data-chat-assistant-activity-section="true"]')
        .first();
      await expect(activitySection).toBeVisible();
      await expect(activitySection).toContainText("setta__report_completion_status");

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

  test("project chat enables thinking for managed Gemini engines with backend runtime support", async ({
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
    const providerServer = await startManagedGeminiThinkingServer();

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

      const geminiConfigId = `e2e-gemini-thinking-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [geminiConfigId]: {
            model: "gemini-2.5-pro",
            provider: "gemini",
            api_key_env: "GEMINI_API_KEY",
            base_url: providerServer.origin,
            other_params: {
              thinking_config: {
                thinking_budget: 128,
                thinking_level: "medium",
              },
            },
          },
        },
      };
      await postBackend(page, "/llm/config", updatedLLMConfig);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          GEMINI_API_KEY: "e2e-gemini-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "Gemini Thinking E2E",
          engineType: "setta_llm",
          settaLlmConfigId: geminiConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing Gemini thinking engine config id.");
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
      await selectProjectAiEngine(page, "Gemini Thinking E2E");

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
      await input.fill("Trigger managed Gemini thinking");
      await input.press("Enter");

      await expect.poll(() => submittedPayload?.thinking ?? null).toBe(true);
      expect(submittedPayload?.engineConfigId).toBe(createdEngineConfigId);
      await expect.poll(() => providerServer.requests.length).toBe(1);

      const providerRequest = providerServer.requests[0];
      expect(providerRequest?.path).toBe(
        "/v1beta/models/gemini-2.5-pro:streamGenerateContent",
      );
      expect(providerRequest?.query).toBe("alt=sse");
      expect(providerRequest?.apiKey).toBe("e2e-gemini-secret");
      const generationConfig = providerRequest?.body.generationConfig as
        | Record<string, unknown>
        | undefined;
      const thinkingConfig = generationConfig?.thinkingConfig as
        | Record<string, unknown>
        | undefined;
      expect(thinkingConfig?.includeThoughts).toBe(true);
      expect(JSON.stringify(providerRequest?.body.contents ?? null)).toContain(
        "Trigger managed Gemini thinking",
      );

      await expect(projectChatSurface.getByText("Gemini answer")).toBeVisible();
      await expect(
        projectChatSurface.locator('[data-chat-thinking-section="true"]'),
      ).toContainText("Planning");
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

  test("project chat submits standard managed Gemini turns through the Go runtime", async ({
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
    const providerServer = await startManagedGeminiStandardServer();

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

      const geminiConfigId = `e2e-gemini-standard-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [geminiConfigId]: {
            model: "gemini-2.5-pro",
            provider: "gemini",
            api_key_env: "GEMINI_API_KEY",
            base_url: providerServer.origin,
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
          GEMINI_API_KEY: "e2e-gemini-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "Gemini Standard E2E",
          engineType: "setta_llm",
          settaLlmConfigId: geminiConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing Gemini standard engine config id.");
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
      await selectProjectAiEngine(page, "Gemini Standard E2E");
      await expect(
        projectChatSurface.getByRole("button", { name: "Thinking" }),
      ).toHaveCount(0);

      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await input.fill("Trigger managed Gemini standard chat");
      await input.press("Enter");

      await expect
        .poll(() => submittedPayload?.engineConfigId ?? null)
        .toBe(createdEngineConfigId);
      expect(submittedPayload?.thinking).toBe(false);
      await expect.poll(() => providerServer.requests.length).toBe(1);

      const providerRequest = providerServer.requests[0];
      expect(providerRequest?.path).toBe(
        "/v1beta/models/gemini-2.5-pro:streamGenerateContent",
      );
      expect(providerRequest?.query).toBe("alt=sse");
      expect(providerRequest?.apiKey).toBe("e2e-gemini-secret");
      const generationConfig = providerRequest?.body.generationConfig as
        | Record<string, unknown>
        | undefined;
      expect(generationConfig?.temperature).toBe(0.2);
      expect(generationConfig?.thinkingConfig).toBeUndefined();
      expect(JSON.stringify(providerRequest?.body.contents ?? null)).toContain(
        "Trigger managed Gemini standard chat",
      );

      await expect(
        projectChatSurface.getByText("Gemini standard answer"),
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

  test("project chat stops a managed Gemini response through the Go runtime", async ({
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
    const providerServer = await startManagedGeminiAbortableServer();

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

      const geminiConfigId = `e2e-gemini-stop-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [geminiConfigId]: {
            model: "gemini-2.5-pro",
            provider: "gemini",
            api_key_env: "GEMINI_API_KEY",
            base_url: providerServer.origin,
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
          GEMINI_API_KEY: "e2e-gemini-stop-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "Gemini Stop E2E",
          engineType: "setta_llm",
          settaLlmConfigId: geminiConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing Gemini stop engine config id.");
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
      await selectProjectAiEngine(page, "Gemini Stop E2E");
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

      await expect
        .poll(() => stopOutcome?.alreadyStopped ?? null)
        .toBe(false);
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
        "/v1beta/models/gemini-2.5-pro:streamGenerateContent",
      );
      expect(providerRequest?.query).toBe("alt=sse");
      expect(providerRequest?.apiKey).toBe("e2e-gemini-stop-secret");
      const generationConfig = providerRequest?.body.generationConfig as
        | Record<string, unknown>
        | undefined;
      expect(generationConfig?.temperature).toBe(0.2);
      expect(generationConfig?.thinkingConfig).toBeUndefined();
      expect(JSON.stringify(providerRequest?.body.contents ?? null)).toContain(
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

  test("project chat runs managed Gemini MCP tool calls through the Go runtime", async ({
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
    const providerServer = await startManagedGeminiToolCallServer();

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

      const geminiConfigId = `e2e-gemini-tool-call-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [geminiConfigId]: {
            model: "gemini-2.5-pro",
            provider: "gemini",
            api_key_env: "GEMINI_API_KEY",
            base_url: providerServer.origin,
            mcpServerIds: ["setta"],
            other_params: null,
          },
        },
        mcpServers: {
          ...initialLLMConfig.mcpServers,
          setta: {
            transport: "sse",
            url: `${backendOrigin}/mcp`,
          },
        },
      };
      await postBackend(page, "/llm/config", updatedLLMConfig);
      latestAPIKeysSnapshot = await postManagedAPIKeys(page, {
        apiKeys: {
          ...initialAPIKeysSnapshot.apiKeys,
          GEMINI_API_KEY: "e2e-gemini-secret",
        },
        expectedRevision: initialAPIKeysSnapshot.revision,
      });

      const createdEngine = await postBackend<EngineConfigSummary>(
        page,
        "/createEngineConfig",
        {
          name: "Gemini Tool Call E2E",
          engineType: "setta_llm",
          settaLlmConfigId: geminiConfigId,
          defaults: {},
        },
      );
      createdEngineConfigId = createdEngine?.id ?? null;
      if (!createdEngineConfigId) {
        throw new Error("Missing Gemini tool-call engine config id.");
      }

      await expect
        .poll(async () => {
          const response = await page.request.post(
            `${backendOrigin}/api/mcpServerRuntimeStatus`,
            { data: {} },
          );
          expect(response.ok()).toBe(true);
          const payload =
            (await response.json()) as MCPRuntimeStatusResponse;
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
      await selectProjectAiEngine(page, "Gemini Tool Call E2E");
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
      expect(firstProviderRequest?.path).toBe(
        "/v1beta/models/gemini-2.5-pro:streamGenerateContent",
      );
      expect(firstProviderRequest?.query).toBe("alt=sse");
      expect(firstProviderRequest?.apiKey).toBe("e2e-gemini-secret");
      const firstTools = Array.isArray(firstProviderRequest?.body.tools)
        ? firstProviderRequest.body.tools
        : [];
      expect(JSON.stringify(firstTools)).toContain(
        "setta__report_completion_status",
      );

      const secondProviderRequest = providerServer.requests[1];
      const secondContents = Array.isArray(secondProviderRequest?.body.contents)
        ? secondProviderRequest.body.contents
        : [];
      const secondContentsJSON = JSON.stringify(secondContents);
      expect(secondContentsJSON).toContain('"functionCall"');
      expect(secondContentsJSON).toContain('"functionResponse"');

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
      await expect(projectChatSurface).toContainText("Tool-backed gemini reply");
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

      await expect
        .poll(() => stopOutcome?.alreadyStopped ?? null)
        .toBe(false);
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

  test("project chat /new first submit keeps the selected thread group assignment", async ({
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
    const newChatId = "pw-slash-new-group-chat";

    await page.route("**/api/getEngineConfigs", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "engine-e2e-setta",
            name: "Setta E2E",
            engineType: "setta_llm",
            settaLlmConfigId: "llm-e2e",
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
            "llm-e2e": {
              id: "llm-e2e",
              model: "gpt-4o-mini",
              provider: "openai",
              api_key_env: null,
              base_url: null,
              other_params: {},
              mcpServerIds: [],
              temporary: false,
            },
          },
          mcpServers: {},
          defaultMcpServerIds: [],
          default_config_id: "llm-e2e",
        }),
      });
    });
    await page.route("**/api/llm/apiKeys", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          apiKeys: {},
          revision: 0,
        }),
      });
    });

    await page.route("**/api/getLLMResponse", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(newChatId),
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
            id: "e2e-llm",
            model: "gpt-4o-mini",
            provider: "openai",
            api_key_env: null,
            base_url: null,
            other_params: {},
            mcpServerIds: [],
            temporary: false,
          },
          contextUsage: null,
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
      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, "Setta E2E");

      const threadsPanel = projectChatSurface.getByTestId(
        "project-chat-threads-panel",
      );
      if (
        (await threadsPanel.count()) === 0 ||
        !(await threadsPanel.first().isVisible())
      ) {
        await projectChatSurface
          .getByRole("button", { name: "View Threads" })
          .click();
      }
      await expect(threadsPanel).toBeVisible();

      await projectChatSurface
        .getByRole("button", { name: "New Group" })
        .click();
      const groupNameInput = threadsPanel.getByTestId(
        "project-chat-thread-group-name-input",
      );
      await expect(groupNameInput).toBeVisible();
      await groupNameInput.fill("Backend");
      await groupNameInput.press("Enter");
      const backendGroupRow = threadsPanel
        .getByTestId("project-chat-thread-group-row")
        .filter({ hasText: "Backend" });
      await expect(backendGroupRow).toBeVisible();
      const backendGroupButton = backendGroupRow.getByRole("button", {
        name: "Backend",
        exact: true,
      });
      await backendGroupButton.click();
      await expect(backendGroupButton.locator("span").nth(1)).toHaveClass(
        /text-blue-700/,
      );

      const returnToChatButton = projectChatSurface
        .getByRole("button", { name: "Return to chat" })
        .first();
      if (await returnToChatButton.isVisible()) {
        await returnToChatButton.click();
      }

      const composerInput =
        projectChatSurface.getByPlaceholder("Type a message...");
      await expect(composerInput).toBeVisible();
      await composerInput.fill("/new");
      await composerInput.press("Enter");
      await expect(
        projectChatSurface.getByText("Started a new chat thread."),
      ).toBeVisible();

      await composerInput.fill("Route this thread into Backend");
      await composerInput.press("Enter");

      await expect
        .poll(
          async () =>
            await page.evaluate(
              ({ projectConfigId, chatId }) => {
                const raw = window.localStorage.getItem("setta_data");
                if (!raw) {
                  return false;
                }
                const parsed = JSON.parse(raw) as {
                  state?: Record<string, unknown>;
                };
                const state = parsed.state ?? {};
                const groupsByProject =
                  (state.projectChatThreadGroupsByProjectConfigId as
                    | Record<string, Array<{ id: string; name: string }>>
                    | undefined) ?? {};
                const assignmentsByProject =
                  (state.projectChatThreadAssignmentsByProjectConfigId as
                    | Record<string, Record<string, string>>
                    | undefined) ?? {};
                const groups = groupsByProject[projectConfigId] ?? [];
                const backendGroupId =
                  groups.find((group) => group.name === "Backend")?.id ?? null;
                if (!backendGroupId) {
                  return false;
                }
                const assignedGroupId =
                  assignmentsByProject[projectConfigId]?.[chatId] ?? null;
                return assignedGroupId === backendGroupId;
              },
              {
                projectConfigId: projectContext.projectConfigId,
                chatId: newChatId,
              },
            ),
          { timeout: 15000 },
        )
        .toBe(true);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("managed chat section shows estimated context badge from hydrated usage and toggles display mode", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    await page.route("**/api/getLLMResponse", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("pw-context-chat"),
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
    await page.route("**/api/getLLMChat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [],
          waitingForResponse: false,
          llmConfig: {
            id: "pw-context-config",
            model: "gpt-5-codex",
            provider: "openai",
            base_url: null,
            api_key_env: null,
            other_params: null,
            mcpServerIds: null,
            temporary: false,
          },
          contextUsage: {
            contextWindowTokens: 200,
            contextUsedTokens: 150,
            estimated: true,
          },
        }),
      });
    });

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_context_badge__",
      );
      const backendOrigin =
        process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      const managedEngineId =
        engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
        null;
      if (!managedEngineId) {
        throw new Error("Missing managed LLM engine config.");
      }
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        managed: true,
        engineConfigId: managedEngineId,
        agentProfileId: null,
        transcriptionProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      const input = section.locator("textarea").first();
      await expect(input).toBeVisible();

      await input.fill("Context badge test");
      await input.press("Enter");

      const percentageBadge = section.getByRole("button", {
        name: /^est\. context(?: left)? 25%$/i,
      });
      await expect(percentageBadge).toBeVisible();
      await percentageBadge.click();
      await expect(
        section.getByRole("button", {
          name: /^est\. context(?: left)? ~50$/i,
        }),
      ).toBeVisible();
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("managed chat section shows non-estimated context percentages for large windows", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    await page.route("**/api/getLLMResponse", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("pw-context-chat-large-window"),
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
    await page.route("**/api/getLLMChat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [],
          waitingForResponse: false,
          llmConfig: {
            id: "pw-context-config-large-window",
            model: "gpt-5-codex",
            provider: "openai",
            base_url: null,
            api_key_env: null,
            other_params: null,
            mcpServerIds: null,
            temporary: false,
          },
          contextUsage: {
            contextWindowTokens: 258400,
            contextUsedTokens: 24766,
            estimated: false,
          },
        }),
      });
    });

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_context_badge_large_window__",
      );
      const backendOrigin =
        process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      const managedEngineId =
        engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
        null;
      if (!managedEngineId) {
        throw new Error("Missing managed LLM engine config.");
      }
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        managed: true,
        engineConfigId: managedEngineId,
        agentProfileId: null,
        transcriptionProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      const input = section.locator("textarea").first();
      await expect(input).toBeVisible();

      await input.fill("Context badge large-window test");
      await input.press("Enter");

      await expect(
        section.getByRole("button", {
          name: /^context(?: left)? 90%$/i,
        }),
      ).toBeVisible();
      await expect(
        section.getByRole("button", {
          name: /^est\. context(?: left)?/i,
        }),
      ).toHaveCount(0);
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("managed chat section shows context unavailable badge when usage payload is missing", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    await page.route("**/api/getLLMResponse", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("pw-context-chat-missing-usage"),
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
    await page.route("**/api/getLLMChat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [],
          waitingForResponse: false,
          llmConfig: {
            id: "pw-context-config",
            model: "gpt-5-codex",
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

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_context_badge_missing_usage__",
      );
      const backendOrigin =
        process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      const managedEngineId =
        engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
        null;
      if (!managedEngineId) {
        throw new Error("Missing managed LLM engine config.");
      }
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        managed: true,
        engineConfigId: managedEngineId,
        agentProfileId: null,
        transcriptionProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      await expect(section.locator("textarea").first()).toBeVisible();
      await expect(section.getByLabel(/context unavailable/i)).toBeVisible();
      await expect(
        section.getByRole("button", {
          name: /^est\. context(?: left)?/i,
        }),
      ).toHaveCount(0);
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("managed chat section shows context unavailable badge when usage payload is partial", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    await page.route("**/api/getLLMResponse", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("pw-context-chat-partial-usage"),
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
    await page.route("**/api/getLLMChat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [],
          waitingForResponse: false,
          llmConfig: {
            id: "pw-context-config",
            model: "gpt-5-codex",
            provider: "openai",
            base_url: null,
            api_key_env: null,
            other_params: null,
            mcpServerIds: null,
            temporary: false,
          },
          contextUsage: {
            contextWindowTokens: 200,
            contextUsedTokens: null,
            estimated: false,
          },
        }),
      });
    });

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_context_badge_partial_usage__",
      );
      const backendOrigin =
        process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      const managedEngineId =
        engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
        null;
      if (!managedEngineId) {
        throw new Error("Missing managed LLM engine config.");
      }
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        managed: true,
        engineConfigId: managedEngineId,
        agentProfileId: null,
        transcriptionProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      await expect(section.locator("textarea").first()).toBeVisible();
      await expect(section.getByLabel(/context unavailable/i)).toBeVisible();
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat collapses the threads label below the toolbar label breakpoint while keeping settings accessible", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);

    try {
      await page.reload();
      await page.waitForSelector(".react-flow__pane");

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();
      const projectChatSurface = await getVisibleProjectChatSurface(page);
      const returnToChatButton = projectChatSurface
        .getByRole("button", { name: /^Return to chat$/ })
        .first();
      if (await returnToChatButton.isVisible()) {
        await returnToChatButton.click();
      }

      const historyVisibleLabel = projectChatSurface
        .getByRole("button", { name: "View Threads" })
        .locator("span", { hasText: /^Threads$/ })
        .first();
      const settingsButton = projectChatSurface.getByRole("button", {
        name: "Project AI Settings",
      });

      await setProjectChatSurfaceWidth(page, 820);
      await expect(historyVisibleLabel).toBeVisible();
      await expect(settingsButton).toBeVisible();

      await setProjectChatSurfaceWidth(page, 700);
      await expect(historyVisibleLabel).toBeHidden();
      await expect(settingsButton).toBeVisible();
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("managed chat sections reject unavailable slash commands locally instead of forwarding to model", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    let llmSubmitCount = 0;
    await page.route("**/api/getLLMResponse", async (route) => {
      llmSubmitCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("pw-managed-unavailable-slash"),
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

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_managed_chat_unavailable_slash__",
      );
      const backendOrigin =
        process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      const managedEngineId =
        engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
        null;
      if (!managedEngineId) {
        throw new Error("Missing managed LLM engine config.");
      }
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        managed: true,
        engineConfigId: managedEngineId,
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      const input = section.locator("textarea").first();

      // `/search` is intentionally unavailable in managed section slash menus.
      await input.fill("/search off");
      await input.press("Enter");

      await expect(
        section.getByText(
          "/search is unavailable in the current context. Use /help.",
        ),
      ).toBeVisible();
      expect(llmSubmitCount).toBe(0);
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat allows prompts that begin with absolute paths", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
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
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    let llmSubmitCount = 0;
    const fakeChatId = "pw-path-chat";

    await page.route("**/api/getLLMResponse", async (route) => {
      llmSubmitCount += 1;
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
          messages: [],
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

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await input.fill("/tmp build logs look stale");
      await input.press("Enter");

      await expect.poll(() => llmSubmitCount).toBe(1);
      await expect(
        projectChatSurface.getByText(
          "Unknown or unavailable command. Use /help.",
        ),
      ).toHaveCount(0);
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat ArrowUp cycles submitted prompts from prior conversations", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);

    await page.route("**/api/getAgentRuns", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "run-history-newer",
            profileId: null,
            status: "completed",
            startedAt: "2026-02-02T00:00:00Z",
            finishedAt: "2026-02-02T00:00:01Z",
            events: [],
            inputs: {
              runType: "llm_chat",
              projectConfigId: projectContext.projectConfigId,
              chatId: "history-chat-newer",
              sectionId: null,
              messages: [
                {
                  id: "history-user-1",
                  role: "user",
                  content: [{ type: "text", text: "History prompt older" }],
                  attachments: [],
                },
                {
                  id: "history-user-2",
                  role: "user",
                  content: [{ type: "text", text: "History prompt newest" }],
                  attachments: [],
                },
              ],
            },
            outputs: {},
          },
          {
            id: "run-history-older",
            profileId: null,
            status: "completed",
            startedAt: "2026-02-01T00:00:00Z",
            finishedAt: "2026-02-01T00:00:01Z",
            events: [],
            inputs: {
              runType: "llm_chat",
              projectConfigId: projectContext.projectConfigId,
              chatId: "history-chat-older",
              sectionId: null,
              messages: [
                {
                  id: "history-user-3",
                  role: "user",
                  content: [{ type: "text", text: "History prompt oldest" }],
                  attachments: [],
                },
              ],
            },
            outputs: {},
          },
        ]),
      });
    });

    try {
      await setOverviewTab(page, "ProjectAIChat");
      await page.reload();
      await page.waitForSelector(".react-flow__pane");

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();
      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, "setta");

      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toHaveValue("");

      await input.fill("   ");
      await input.press("ArrowUp");
      await expect(input).toHaveValue("History prompt newest");
      await input.press("Escape");
      await expect(input).toHaveValue("   ");

      await input.fill("");
      await input.press("ArrowUp");
      await expect(input).toHaveValue("History prompt newest");
      await input.press("ArrowUp");
      await expect(input).toHaveValue("History prompt older");
      await input.press("ArrowUp");
      await expect(input).toHaveValue("History prompt oldest");
      await input.press("ArrowDown");
      await expect(input).toHaveValue("History prompt older");
      await input.press("ArrowDown");
      await expect(input).toHaveValue("History prompt newest");
      await input.press("ArrowDown");
      await expect(input).toHaveValue("");
      await input.press("ArrowUp");
      await expect(input).toHaveValue("History prompt newest");
      await input.press("Escape");
      await expect(input).toHaveValue("");
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project and section chat use a constrained content shell", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);

    try {
      await page.reload();
      await page.waitForSelector(".react-flow__pane");

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();
      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, "setta");

      const projectShell = projectChatSurface
        .locator('[data-chat-width-shell="true"]')
        .first();
      await expect(projectShell).toBeVisible();
      await expect(projectShell).toHaveClass(/max-w-\[72rem\]/);

      const { sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_width_shell__",
      );
      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      const sectionShell = section
        .locator('[data-chat-width-shell="true"]')
        .first();
      await expect(sectionShell).toBeVisible();
      await expect(sectionShell).toHaveClass(/max-w-\[72rem\]/);
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat thread list includes mixed-engine history entries", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);

    const backendOrigin =
      process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
    const engineConfigsResponse = await page.request.get(
      `${backendOrigin}/api/getEngineConfigs`,
    );
    expect(engineConfigsResponse.ok()).toBe(true);
    const engineConfigs =
      (await engineConfigsResponse.json()) as EngineConfigSummary[];
    const activeEngineId =
      engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
      null;
    if (!activeEngineId) {
      throw new Error("Missing managed LLM engine config for history test.");
    }
    const externalEngine =
      engineConfigs.find((config) => config.engineType === "external_agent") ??
      null;
    if (!externalEngine?.externalAgentConfigId) {
      throw new Error(
        "Missing external engine config for mixed-engine history test.",
      );
    }
    const externalAgentConfigsResponse = await page.request.get(
      `${backendOrigin}/api/getExternalAgentConfigs`,
    );
    expect(externalAgentConfigsResponse.ok()).toBe(true);
    const externalAgentConfigs =
      (await externalAgentConfigsResponse.json()) as Array<{
        id: string;
        toolType: "codex" | "claude_code" | "opencode";
      }>;
    const externalAgentConfig = externalAgentConfigs.find(
      (config) => config.id === externalEngine.externalAgentConfigId,
    );
    if (!externalAgentConfig) {
      throw new Error(
        "Missing external agent config for mixed-engine history test.",
      );
    }
    const externalBadgeTextByToolType: Record<
      "codex" | "claude_code" | "opencode",
      string
    > = {
      codex: "codex",
      claude_code: "claude",
      opencode: "opencode",
    };
    const expectedExternalBadgeText =
      externalBadgeTextByToolType[externalAgentConfig.toolType];
    if (!expectedExternalBadgeText) {
      throw new Error("Unsupported external agent tool type for history test.");
    }

    const matchingChatId = "chat-resume-match";
    const mismatchedChatId = "chat-resume-mismatch";
    const externalChatId = "chat-resume-external";
    await page.route("**/api/getAgentRuns", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "run-match",
            profileId: null,
            status: "completed",
            startedAt: "2026-01-01T00:00:00Z",
            finishedAt: "2026-01-01T00:00:01Z",
            events: [],
            inputs: {
              runType: "llm_chat",
              projectConfigId: projectContext.projectConfigId,
              chatId: matchingChatId,
              engineConfigId: activeEngineId,
              messages: [
                {
                  id: "msg-match",
                  role: "user",
                  content: [{ type: "text", text: "matching history entry" }],
                  attachments: [],
                },
              ],
            },
            outputs: {},
          },
          {
            id: "run-mismatch",
            profileId: null,
            status: "completed",
            startedAt: "2026-01-02T00:00:00Z",
            finishedAt: "2026-01-02T00:00:01Z",
            events: [],
            inputs: {
              runType: "llm_chat",
              projectConfigId: projectContext.projectConfigId,
              chatId: mismatchedChatId,
              engineConfigId: "engine-incompatible",
              messages: [
                {
                  id: "msg-mismatch",
                  role: "user",
                  content: [{ type: "text", text: "mismatch history entry" }],
                  attachments: [],
                },
              ],
            },
            outputs: {},
          },
          {
            id: "run-external",
            profileId: null,
            status: "completed",
            startedAt: "2026-01-03T00:00:00Z",
            finishedAt: "2026-01-03T00:00:01Z",
            events: [],
            inputs: {
              runType: "external_agent",
              projectConfigId: projectContext.projectConfigId,
              chatId: externalChatId,
              engineConfigId: externalEngine.id,
              messages: [
                {
                  id: "msg-external",
                  role: "user",
                  content: [{ type: "text", text: "external history entry" }],
                  attachments: [],
                },
              ],
            },
            outputs: {},
          },
        ]),
      });
    });
    try {
      await page.reload();
      await page.waitForSelector(".react-flow__pane");

      const overviewPane = page.locator("#OverviewPane");
      await expect(
        overviewPane.getByRole("heading", { name: "Project AI Chat" }),
      ).toBeVisible();
      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await selectProjectAiEngine(page, "setta");

      const closeThreadsIfOpen = async () => {
        const returnToChatButton = projectChatSurface
          .getByRole("button", { name: /^Return to chat$/ })
          .first();
        if (await returnToChatButton.isVisible()) {
          await returnToChatButton.click();
          return;
        }
        const existingThreadsPanel = projectChatSurface.getByTestId(
          "project-chat-threads-panel",
        );
        if (
          (await existingThreadsPanel.count()) > 0 &&
          (await existingThreadsPanel.first().isVisible())
        ) {
          await projectChatSurface
            .getByRole("button", { name: "View Threads" })
            .click();
        }
      };
      await closeThreadsIfOpen();

      await projectChatSurface
        .getByRole("button", { name: "View Threads" })
        .click();
      await expect(
        projectChatSurface.getByText("matching history entry"),
      ).toBeVisible();
      await expect(
        projectChatSurface.getByText("mismatch history entry"),
      ).toBeVisible();
      await expect(
        projectChatSurface.getByText("external history entry"),
      ).toBeVisible();
      const matchingThreadEntry = projectChatSurface
        .getByTestId("project-chat-thread-entry")
        .filter({ hasText: "matching history entry" })
        .first();
      await expect(
        matchingThreadEntry.getByTestId("project-chat-thread-agent-badge"),
      ).toHaveText(/setta/i);
      const externalThreadEntry = projectChatSurface
        .getByTestId("project-chat-thread-entry")
        .filter({ hasText: "external history entry" })
        .first();
      await expect(
        externalThreadEntry.getByTestId("project-chat-thread-agent-badge"),
      ).toHaveText(new RegExp(expectedExternalBadgeText, "i"));
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("chat section history refreshes runs when the history panel opens", async ({
    page,
  }) => {
    let historySectionId: string | null = null;
    let historyProjectConfigId: string | null = null;
    let historyEngineConfigId: string | null = null;
    let historyRefreshArmed = false;
    let getAgentRunsRequestCount = 0;
    await page.route("**/api/getAgentRuns", async (route) => {
      getAgentRunsRequestCount += 1;
      const runs =
        historyRefreshArmed &&
        historySectionId &&
        historyProjectConfigId &&
        historyEngineConfigId
          ? [
              {
                id: "run-history-refresh",
                profileId: null,
                status: "completed",
                startedAt: "2026-01-01T00:00:00Z",
                finishedAt: "2026-01-01T00:00:01Z",
                events: [],
                inputs: {
                  runType: "llm_chat",
                  projectConfigId: historyProjectConfigId,
                  chatId: "chat-history-refresh",
                  sectionId: historySectionId,
                  engineConfigId: historyEngineConfigId,
                  messages: [
                    {
                      id: "history-message-1",
                      role: "user",
                      content: [
                        { type: "text", text: "History refreshed entry" },
                      ],
                      attachments: [],
                    },
                  ],
                },
                outputs: {},
              },
            ]
          : [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(runs),
      });
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    historyProjectConfigId = projectContext.projectConfigId;
    const engineCleanup = await ensureManagedChatEngine(page);

    try {
      const backendOrigin =
        process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      historyEngineConfigId =
        engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
        null;
      if (!historyEngineConfigId) {
        throw new Error(
          "Missing managed LLM engine config for history refresh.",
        );
      }
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_history_refresh__",
      );
      historySectionId = sectionId;
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        managed: true,
        engineConfigId: historyEngineConfigId,
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });
      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      await expect(
        section.getByRole("button", { name: "History" }),
      ).toBeVisible();
      const initialRequestCount = getAgentRunsRequestCount;
      historyRefreshArmed = true;
      await section.getByRole("button", { name: "History" }).click();
      await expect
        .poll(() => getAgentRunsRequestCount, { timeout: 15000 })
        .toBeGreaterThan(initialRequestCount);
      await expect(section.getByText("History refreshed entry")).toBeVisible();
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("chat section defers run history loading until history is opened", async ({
    page,
  }) => {
    let getAgentRunsRequestCount = 0;
    await page.route("**/api/getAgentRuns", async (route) => {
      getAgentRunsRequestCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const requestCountBeforeSection = getAgentRunsRequestCount;
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_history_lazy__",
      );
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        managed: true,
        engineConfigId: null,
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();
      await page.waitForTimeout(1200);
      expect(getAgentRunsRequestCount).toBe(requestCountBeforeSection);

      await section.getByRole("button", { name: "History" }).click();
      await expect
        .poll(() => getAgentRunsRequestCount, { timeout: 15000 })
        .toBeGreaterThan(requestCountBeforeSection);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("chat section history avoids polling while all runs are idle", async ({
    page,
  }) => {
    let idleSectionId: string | null = null;
    let idleProjectConfigId: string | null = null;
    let idleEngineConfigId: string | null = null;
    let getAgentRunsRequestCount = 0;
    await page.route("**/api/getAgentRuns", async (route) => {
      getAgentRunsRequestCount += 1;
      const runs =
        idleSectionId === null ||
        idleProjectConfigId === null ||
        idleEngineConfigId === null
          ? []
          : [
              {
                id: "run-history-idle",
                profileId: null,
                status: "completed",
                startedAt: "2026-02-01T00:00:00Z",
                finishedAt: "2026-02-01T00:00:01Z",
                events: [],
                inputs: {
                  runType: "llm_chat",
                  projectConfigId: idleProjectConfigId,
                  chatId: "chat-history-idle",
                  sectionId: idleSectionId,
                  engineConfigId: idleEngineConfigId,
                  messages: [
                    {
                      id: "history-idle-message",
                      role: "user",
                      content: [{ type: "text", text: "Idle history entry" }],
                      attachments: [],
                    },
                  ],
                },
                outputs: {},
              },
            ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(runs),
      });
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    idleProjectConfigId = projectContext.projectConfigId;
    const engineCleanup = await ensureManagedChatEngine(page);

    try {
      const backendOrigin =
        process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
      const engineConfigsResponse = await page.request.get(
        `${backendOrigin}/api/getEngineConfigs`,
      );
      expect(engineConfigsResponse.ok()).toBe(true);
      const engineConfigs =
        (await engineConfigsResponse.json()) as EngineConfigSummary[];
      idleEngineConfigId =
        engineConfigs.find((config) => config.engineType === "setta_llm")?.id ??
        null;
      if (!idleEngineConfigId) {
        throw new Error("Missing managed LLM engine config for idle history.");
      }
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_chat_history_idle__",
      );
      idleSectionId = sectionId;
      await postBackend(page, "/setChatSectionSettings", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        managed: true,
        engineConfigId: idleEngineConfigId,
        transcriptionProfileId: null,
        agentProfileId: null,
        thinking: false,
        permissionMode: "minimal",
        searchEnabled: true,
        dictationMode: "auto",
      });

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await section.getByRole("button", { name: "History" }).click();
      await expect(section.getByText("Idle history entry")).toBeVisible();
      const requestCountAfterOpen = getAgentRunsRequestCount;

      await page.waitForTimeout(6200);
      expect(getAgentRunsRequestCount).toBe(requestCountAfterOpen);
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) })
    .first();
}

async function mountManagedChatAreaForSharePolicy(
  page: Page,
  { allowLLM }: { allowLLM: boolean },
): Promise<Locator> {
  const containerId = `managed-chat-preview-${Date.now()}`;
  await page.evaluate(
    async ({ containerId, allowLLM }) => {
      const { useProjectState, useShareSession } = await import(
        "/src/state/definitions.ts"
      );
      const { resetProjectStores } = await import("/src/state/utils.ts");
      const {
        createChatSectionImpl,
        createCore,
        createProjectConfig,
        createUserDefaultChatSectionImpl,
        createVariant,
      } = await import("/src/utils/generatedTypes.ts");
      const { React, createRoot } = await import(
        "/src/testUtils/appRouteTestUtils.ts"
      );
      const { ChatArea } = await import(
        "/src/components/Section/Layouts/ChatArea.tsx"
      );

      resetProjectStores();
      useShareSession.setState({
        isDeploymentMode: true,
        sharePolicy: {
          allowLLM,
          allowLayoutChanges: false,
          allowParamChanges: false,
          allowVariantChanges: false,
          allowRun: false,
          allowMultipleRuns: false,
        },
        shareSessionId: null,
        sessionRunCount: 0,
        shareDeploymentName: null,
        shareDeploymentVersion: null,
        deploymentMode: null,
      });

      const sectionId = "managed-chat-preview-section";
      const variantId = "managed-chat-preview-variant";
      const implId = "managed-chat-preview-impl";
      useProjectState.setState({
        projectConfig: createProjectConfig({
          id: "managed-chat-preview-project",
          name: "Managed Chat Preview",
          sectionVariantMap: { [sectionId]: variantId },
          topLevelSections: {
            [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
          },
          agenticEdges: [],
        }),
        sections: {
          [sectionId]: createCore({
            id: sectionId,
            name: "Managed Chat Preview",
            variants: [variantId],
            defaultVariant: variantId,
          }),
        },
        sectionVariants: {
          [variantId]: createVariant({
            id: variantId,
            name: "Managed Chat Preview Variant",
            impl: implId,
            nonPresetImpls: [],
          }),
        },
        sectionImpls: {
          [implId]: createChatSectionImpl(
            createUserDefaultChatSectionImpl({
              managed: true,
              chatId: null,
              thinking: false,
            }),
            {
              id: implId,
            },
          ),
        },
        parentSectionMap: { [sectionId]: null },
        previewSectionVariantMap: {},
      });

      const existing = document.getElementById(containerId);
      existing?.remove();
      const container = document.createElement("div");
      container.id = containerId;
      document.body.appendChild(container);

      const root = createRoot(container);
      root.render(React.createElement(ChatArea, { sectionId }));

      for (let attempt = 0; attempt < 100; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (container.querySelector("textarea")) {
          return;
        }
      }
      throw new Error("Managed chat preview did not render.");
    },
    { containerId, allowLLM },
  );

  return page.locator(`#${containerId}`);
}

async function selectProjectAiEngine(
  page: Page,
  engineQuery: string,
): Promise<void> {
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  await projectChatSurface
    .getByRole("button", { name: "Project AI Settings" })
    .click();
  const engineInput = page.getByPlaceholder("Select an engine");
  await expect(engineInput).toBeVisible();
  await engineInput.fill(engineQuery);
  await engineInput.press("Enter");
}

async function postManagedAPIKeys(
  page: Page,
  payload: {
    apiKeys: Record<string, string>;
    expectedRevision: number;
  },
): Promise<ManagedAPIKeysSnapshot> {
  const backendOrigin =
    process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
  const response = await page.request.post(`${backendOrigin}/api/llm/apiKeys`, {
    data: payload,
  });
  const text = await response.text();
  if (!response.ok()) {
    const detail = text ? ` ${text}` : "";
    throw new Error(
      `Backend request failed (${response.status()}): /llm/apiKeys${detail}`,
    );
  }
  return JSON.parse(text) as ManagedAPIKeysSnapshot;
}

async function startManagedOpenAIResponsesThinkingServer(): Promise<ManagedOpenAIResponsesProviderServer> {
  const requests: ManagedOpenAIResponsesProviderRequest[] = [];
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          requests.push({
            path: new URL(request.url ?? "/", "http://127.0.0.1").pathname,
            authorization: Array.isArray(request.headers.authorization)
              ? request.headers.authorization.join(", ")
              : request.headers.authorization ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        response.write(
          'data: {"type":"response.output_item.added","sequence_number":1,"output_index":0,"item":{"type":"reasoning","id":"reasoning-1","summary":[],"content":[],"status":"in_progress"}}\n\n',
        );
        response.write(
          'data: {"type":"response.reasoning_summary_text.delta","sequence_number":2,"item_id":"reasoning-1","output_index":0,"summary_index":0,"delta":"Plan summary"}\n\n',
        );
        response.write(
          'data: {"type":"response.reasoning_text.delta","sequence_number":3,"item_id":"reasoning-1","output_index":0,"content_index":0,"delta":"Planning deeply"}\n\n',
        );
        response.write(
          'data: {"type":"response.output_text.delta","sequence_number":4,"item_id":"message-1","output_index":1,"content_index":0,"delta":"Final answer","logprobs":[]}\n\n',
        );
        response.end(
          'data: {"type":"response.completed","sequence_number":99,"response":{"id":"response-1","object":"response","created_at":1741567200,"status":"completed","model":"gpt-5-codex","output":[{"type":"reasoning","id":"reasoning-1","summary":[{"text":"Plan summary"}],"content":[{"type":"reasoning_text","text":"Planning deeply"}],"status":"completed"},{"type":"message","id":"message-1","role":"assistant","status":"completed","content":[{"type":"output_text","text":"Final answer","annotations":[]}]}],"usage":{"input_tokens":8,"input_tokens_details":{"cached_tokens":0},"output_tokens":3,"output_tokens_details":{"reasoning_tokens":2},"total_tokens":11}}}\n\n',
        );
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate OpenAI thinking test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

async function startManagedOpenAIChatServer(): Promise<ManagedOpenAIChatProviderServer> {
  const requests: ManagedOpenAIChatProviderRequest[] = [];
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          requests.push({
            path: new URL(request.url ?? "/", "http://127.0.0.1").pathname,
            authorization: Array.isArray(request.headers.authorization)
              ? request.headers.authorization.join(", ")
              : request.headers.authorization ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        response.write(
          'data: {"choices":[{"index":0,"delta":{"content":"OpenAI"}}]}\n\n',
        );
        response.write(
          'data: {"choices":[{"index":0,"delta":{"content":" standard answer"},"finish_reason":"stop"}]}\n\n',
        );
        response.write(
          'data: {"choices":[],"usage":{"prompt_tokens":18,"completion_tokens":3,"total_tokens":21}}\n\n',
        );
        response.end("data: [DONE]\n\n");
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate OpenAI standard test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

async function startManagedOpenAIAbortableChatServer(): Promise<ManagedOpenAIAbortableChatProviderServer> {
  const requests: ManagedOpenAIChatProviderRequest[] = [];
  let abortedRequestCount = 0;
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          requests.push({
            path: new URL(request.url ?? "/", "http://127.0.0.1").pathname,
            authorization: Array.isArray(request.headers.authorization)
              ? request.headers.authorization.join(", ")
              : request.headers.authorization ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        let aborted = false;
        const markAborted = () => {
          if (aborted) {
            return;
          }
          aborted = true;
          abortedRequestCount += 1;
        };

        request.once("aborted", markAborted);
        response.once("close", () => {
          if (!response.writableEnded) {
            markAborted();
          }
        });

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        response.write(
          'data: {"choices":[{"index":0,"delta":{"content":"Streaming"}}]}\n\n',
        );
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate OpenAI abortable test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        get abortedRequestCount() {
          return abortedRequestCount;
        },
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

async function startManagedOpenAIChatToolCallServer(): Promise<ManagedOpenAIChatProviderServer> {
  const requests: ManagedOpenAIChatProviderRequest[] = [];
  let requestCount = 0;
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          requests.push({
            path: new URL(request.url ?? "/", "http://127.0.0.1").pathname,
            authorization: Array.isArray(request.headers.authorization)
              ? request.headers.authorization.join(", ")
              : request.headers.authorization ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        if (requestCount === 0) {
          response.write(
            'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"tool-call-1","type":"function","function":{"name":"setta__report_completion_status","arguments":"{\\"completionIntent\\":false,\\"requiresVerification\\":false}"}}]},"finish_reason":"tool_calls"}]}\n\n',
          );
          response.end("data: [DONE]\n\n");
          requestCount += 1;
          return;
        }
        if (requestCount === 1) {
          response.write(
            'data: {"choices":[{"index":0,"delta":{"content":"Tool-backed"},"finish_reason":null}]}\n\n',
          );
          response.write(
            'data: {"choices":[{"index":0,"delta":{"content":" reply"},"finish_reason":"stop"}]}\n\n',
          );
          response.write(
            'data: {"choices":[],"usage":{"prompt_tokens":24,"completion_tokens":2,"total_tokens":26}}\n\n',
          );
          response.end("data: [DONE]\n\n");
          requestCount += 1;
          return;
        }
        response.statusCode = 500;
        response.end("unexpected provider request");
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate OpenAI tool-call test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

async function startManagedAnthropicThinkingServer(): Promise<ManagedAnthropicThinkingProviderServer> {
  const requests: ManagedAnthropicThinkingProviderRequest[] = [];
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          requests.push({
            path: new URL(request.url ?? "/", "http://127.0.0.1").pathname,
            apiKey: Array.isArray(request.headers["x-api-key"])
              ? request.headers["x-api-key"].join(", ")
              : request.headers["x-api-key"] ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        response.write(
          'event: message_start\ndata: {"type":"message_start","message":{"id":"msg-thinking","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5-20250929","stop_reason":null,"stop_sequence":null,"container":{"id":"container-1","expires_at":"2026-03-12T00:00:00Z"},"usage":{"input_tokens":12,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"inference_geo":"us","server_tool_use":{"web_fetch_requests":0,"web_search_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":0}}}}\n\n',
        );
        response.write(
          'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"Planning"}}\n\n',
        );
        response.write(
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":" deeply"}}\n\n',
        );
        response.write(
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig-thinking"}}\n\n',
        );
        response.write(
          'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        );
        response.write(
          'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n',
        );
        response.write(
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Anthropic answer"}}\n\n',
        );
        response.write(
          'event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n',
        );
        response.write(
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":12,"output_tokens":3,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"server_tool_use":{"web_fetch_requests":0,"web_search_requests":0}}}\n\n',
        );
        response.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Anthropic thinking test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

async function startManagedAnthropicStandardServer(): Promise<ManagedAnthropicStandardProviderServer> {
  const requests: ManagedAnthropicStandardProviderRequest[] = [];
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          requests.push({
            path: new URL(request.url ?? "/", "http://127.0.0.1").pathname,
            apiKey: Array.isArray(request.headers["x-api-key"])
              ? request.headers["x-api-key"].join(", ")
              : request.headers["x-api-key"] ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        response.write(
          'event: message_start\ndata: {"type":"message_start","message":{"id":"msg-standard","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5-20250929","stop_reason":null,"stop_sequence":null,"container":{"id":"container-1","expires_at":"2026-03-12T00:00:00Z"},"usage":{"input_tokens":19,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"inference_geo":"us","server_tool_use":{"web_fetch_requests":0,"web_search_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":0}}}}\n\n',
        );
        response.write(
          'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        );
        response.write(
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Anthropic"}}\n\n',
        );
        response.write(
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" standard answer"}}\n\n',
        );
        response.write(
          'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        );
        response.write(
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":19,"output_tokens":3,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"server_tool_use":{"web_fetch_requests":0,"web_search_requests":0}}}\n\n',
        );
        response.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Anthropic standard test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

async function startManagedAnthropicAbortableServer(): Promise<ManagedAnthropicAbortableProviderServer> {
  const requests: ManagedAnthropicStandardProviderRequest[] = [];
  let abortedRequestCount = 0;
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          requests.push({
            path: new URL(request.url ?? "/", "http://127.0.0.1").pathname,
            apiKey: Array.isArray(request.headers["x-api-key"])
              ? request.headers["x-api-key"].join(", ")
              : request.headers["x-api-key"] ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        let aborted = false;
        const markAborted = () => {
          if (aborted) {
            return;
          }
          aborted = true;
          abortedRequestCount += 1;
        };

        request.once("aborted", markAborted);
        response.once("close", () => {
          if (!response.writableEnded) {
            markAborted();
          }
        });

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        response.write(
          'event: message_start\ndata: {"type":"message_start","message":{"id":"msg-stop","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5-20250929","stop_reason":null,"stop_sequence":null,"container":{"id":"container-stop","expires_at":"2026-03-12T00:00:00Z"},"usage":{"input_tokens":12,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"inference_geo":"us","server_tool_use":{"web_fetch_requests":0,"web_search_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":0}}}}\n\n',
        );
        response.write(
          'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        );
        response.write(
          'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Streaming"}}\n\n',
        );
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Anthropic abortable test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        get abortedRequestCount() {
          return abortedRequestCount;
        },
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

async function startManagedAzureOpenAIChatServer(): Promise<ManagedAzureChatProviderServer> {
  const requests: ManagedAzureChatProviderRequest[] = [];
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          const parsedURL = new URL(request.url ?? "/", "http://127.0.0.1");
          requests.push({
            path: parsedURL.pathname,
            query: parsedURL.searchParams.toString(),
            apiKey: Array.isArray(request.headers["api-key"])
              ? request.headers["api-key"].join(", ")
              : request.headers["api-key"] ?? "",
            authorization: Array.isArray(request.headers.authorization)
              ? request.headers.authorization.join(", ")
              : request.headers.authorization ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        response.write(
          'data: {"choices":[{"index":0,"delta":{"content":"Azure"}}]}\n\n',
        );
        response.write(
          'data: {"choices":[{"index":0,"delta":{"content":" reply"},"finish_reason":"stop"}]}\n\n',
        );
        response.write(
          'data: {"choices":[],"usage":{"prompt_tokens":17,"completion_tokens":2,"total_tokens":19}}\n\n',
        );
        response.end("data: [DONE]\n\n");
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Azure thinking test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

async function startManagedAzureOpenAIAbortableServer(): Promise<ManagedAzureAbortableChatProviderServer> {
  const requests: ManagedAzureChatProviderRequest[] = [];
  let abortedRequestCount = 0;
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          const parsedURL = new URL(request.url ?? "/", "http://127.0.0.1");
          requests.push({
            path: parsedURL.pathname,
            query: parsedURL.searchParams.toString(),
            apiKey: Array.isArray(request.headers["api-key"])
              ? request.headers["api-key"].join(", ")
              : request.headers["api-key"] ?? "",
            authorization: Array.isArray(request.headers.authorization)
              ? request.headers.authorization.join(", ")
              : request.headers.authorization ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        let aborted = false;
        const markAborted = () => {
          if (aborted) {
            return;
          }
          aborted = true;
          abortedRequestCount += 1;
        };

        request.once("aborted", markAborted);
        response.once("close", () => {
          if (!response.writableEnded) {
            markAborted();
          }
        });

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        response.write(
          'data: {"choices":[{"index":0,"delta":{"content":"Streaming"}}]}\n\n',
        );
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Azure abortable test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        get abortedRequestCount() {
          return abortedRequestCount;
        },
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

async function startManagedAnthropicToolCallServer(): Promise<ManagedAnthropicStandardProviderServer> {
  const requests: ManagedAnthropicStandardProviderRequest[] = [];
  let requestCount = 0;
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          requests.push({
            path: new URL(request.url ?? "/", "http://127.0.0.1").pathname,
            apiKey: Array.isArray(request.headers["x-api-key"])
              ? request.headers["x-api-key"].join(", ")
              : request.headers["x-api-key"] ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        if (requestCount === 0) {
          response.write(
            'event: message_start\ndata: {"type":"message_start","message":{"id":"msg-tool-1","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5-20250929","stop_reason":null,"stop_sequence":null,"container":{"id":"container-1","expires_at":"2026-03-12T00:00:00Z"},"usage":{"input_tokens":18,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"inference_geo":"us","server_tool_use":{"web_fetch_requests":0,"web_search_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":0}}}}\n\n',
          );
          response.write(
            'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool-call-1","name":"setta__report_completion_status","input":{}}}\n\n',
          );
          response.write(
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"completionIntent\\":false,\\"requiresVerification\\":false}"}}\n\n',
          );
          response.write(
            'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
          );
          response.write(
            'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"input_tokens":18,"output_tokens":4,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"server_tool_use":{"web_fetch_requests":0,"web_search_requests":0}}}\n\n',
          );
          response.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
          requestCount += 1;
          return;
        }
        if (requestCount === 1) {
          response.write(
            'event: message_start\ndata: {"type":"message_start","message":{"id":"msg-tool-2","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5-20250929","stop_reason":null,"stop_sequence":null,"container":{"id":"container-2","expires_at":"2026-03-12T00:00:00Z"},"usage":{"input_tokens":23,"output_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"inference_geo":"us","server_tool_use":{"web_fetch_requests":0,"web_search_requests":0},"service_tier":"standard","cache_creation":{"ephemeral_1h_input_tokens":0,"ephemeral_5m_input_tokens":0}}}}\n\n',
          );
          response.write(
            'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
          );
          response.write(
            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Tool-backed anthropic reply"}}\n\n',
          );
          response.write(
            'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
          );
          response.write(
            'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":23,"output_tokens":3,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"server_tool_use":{"web_fetch_requests":0,"web_search_requests":0}}}\n\n',
          );
          response.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
          requestCount += 1;
          return;
        }
        response.statusCode = 500;
        response.end("unexpected provider request");
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Anthropic tool-call test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

async function startManagedGeminiStandardServer(): Promise<ManagedGeminiStandardProviderServer> {
  const requests: ManagedGeminiStandardProviderRequest[] = [];
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          const parsedURL = new URL(request.url ?? "/", "http://127.0.0.1");
          requests.push({
            path: parsedURL.pathname,
            query: parsedURL.searchParams.toString(),
            apiKey: Array.isArray(request.headers["x-goog-api-key"])
              ? request.headers["x-goog-api-key"].join(", ")
              : request.headers["x-goog-api-key"] ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        response.write(
          'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Gemini"}]}}]}\n\n',
        );
        response.end(
          'data: {"candidates":[{"content":{"role":"model","parts":[{"text":" standard answer"}]}}],"usageMetadata":{"promptTokenCount":18,"candidatesTokenCount":2,"totalTokenCount":20}}\n\n',
        );
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Gemini standard test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

async function startManagedGeminiAbortableServer(): Promise<ManagedGeminiAbortableProviderServer> {
  const requests: ManagedGeminiStandardProviderRequest[] = [];
  let abortedRequestCount = 0;
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          const parsedURL = new URL(request.url ?? "/", "http://127.0.0.1");
          requests.push({
            path: parsedURL.pathname,
            query: parsedURL.searchParams.toString(),
            apiKey: Array.isArray(request.headers["x-goog-api-key"])
              ? request.headers["x-goog-api-key"].join(", ")
              : request.headers["x-goog-api-key"] ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        let aborted = false;
        const markAborted = () => {
          if (aborted) {
            return;
          }
          aborted = true;
          abortedRequestCount += 1;
        };

        request.once("aborted", markAborted);
        response.once("close", () => {
          if (!response.writableEnded) {
            markAborted();
          }
        });

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        response.write(
          'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Streaming"}]}}],"usageMetadata":{"promptTokenCount":18,"candidatesTokenCount":1,"totalTokenCount":19}}\n\n',
        );
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Gemini abortable test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        get abortedRequestCount() {
          return abortedRequestCount;
        },
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

async function startManagedGeminiToolCallServer(): Promise<ManagedGeminiStandardProviderServer> {
  const requests: ManagedGeminiStandardProviderRequest[] = [];
  let requestCount = 0;
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          const parsedURL = new URL(request.url ?? "/", "http://127.0.0.1");
          requests.push({
            path: parsedURL.pathname,
            query: parsedURL.searchParams.toString(),
            apiKey: Array.isArray(request.headers["x-goog-api-key"])
              ? request.headers["x-goog-api-key"].join(", ")
              : request.headers["x-goog-api-key"] ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        if (requestCount === 0) {
          response.end(
            'data: {"candidates":[{"content":{"role":"model","parts":[{"functionCall":{"id":"tool-call-1","name":"setta__report_completion_status","args":{"completionIntent":false,"requiresVerification":false}}}]}}],"usageMetadata":{"promptTokenCount":18,"candidatesTokenCount":4,"totalTokenCount":22}}\n\n',
          );
          requestCount += 1;
          return;
        }
        if (requestCount === 1) {
          response.end(
            'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Tool-backed gemini reply"}]}}],"usageMetadata":{"promptTokenCount":23,"candidatesTokenCount":3,"totalTokenCount":26}}\n\n',
          );
          requestCount += 1;
          return;
        }
        response.statusCode = 500;
        response.end("unexpected provider request");
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Gemini tool-call test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

async function startManagedGeminiThinkingServer(): Promise<ManagedGeminiThinkingProviderServer> {
  const requests: ManagedGeminiThinkingProviderRequest[] = [];
  return await new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const chunks: string[] = [];
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => {
        chunks.push(chunk);
      });
      request.on("end", () => {
        try {
          const rawBody = chunks.join("");
          const body = rawBody
            ? (JSON.parse(rawBody) as Record<string, unknown>)
            : {};
          requests.push({
            path: new URL(request.url ?? "/", "http://127.0.0.1").pathname,
            query: new URL(
              request.url ?? "/",
              "http://127.0.0.1",
            ).searchParams.toString(),
            apiKey: Array.isArray(request.headers["x-goog-api-key"])
              ? request.headers["x-goog-api-key"].join(", ")
              : request.headers["x-goog-api-key"] ?? "",
            body,
          });
        } catch (error) {
          response.statusCode = 400;
          response.end(String(error));
          return;
        }

        response.statusCode = 200;
        response.setHeader("content-type", "text/event-stream");
        response.write(
          'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Planning","thought":true,"thoughtSignature":"c2ln"}]}}]}\n\n',
        );
        response.end(
          'data: {"candidates":[{"content":{"role":"model","parts":[{"text":"Gemini answer"}]}}],"usageMetadata":{"promptTokenCount":18,"candidatesTokenCount":3,"totalTokenCount":21,"thoughtsTokenCount":2}}\n\n',
        );
      });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to allocate Gemini thinking test port.")),
        );
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () =>
          await new Promise<void>((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          }),
      });
    });
  });
}

async function getVisibleProjectChatSurface(page: Page): Promise<Locator> {
  await collapseSidePanesForWindowInteraction(page);
  const surfaceCandidates = [
    page.getByTestId("project-chat-maximized-window").first(),
    page.getByTestId("project-chat-floating-window").first(),
    page.getByTestId("project-chat-bottom-dock-window-panel").first(),
    page
      .locator('#OverviewPane [data-chat-surface-mode="project_ai_mode"]')
      .first(),
  ];
  await expect
    .poll(async () => {
      for (const candidate of surfaceCandidates) {
        if ((await candidate.count()) > 0 && (await candidate.isVisible())) {
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  for (const candidate of surfaceCandidates) {
    if ((await candidate.count()) > 0 && (await candidate.isVisible())) {
      return candidate;
    }
  }
  throw new Error("No visible project chat surface found.");
}

async function collapseSidePanesForWindowInteraction(
  page: Page,
): Promise<void> {
  await page.evaluate(async () => {
    const { useLocalStorage } = await import("/src/state/definitions.ts");
    useLocalStorage.setState({
      overviewVis: false,
      uiEditorVis: false,
    });
  });
}

async function expectButtonsStackedVertically(
  buttons: Locator[],
): Promise<void> {
  if (buttons.length < 2) {
    throw new Error("Need at least two buttons to verify vertical stacking.");
  }
  const boxes = await Promise.all(
    buttons.map(async (button) => {
      const box = await button.boundingBox();
      if (!box) {
        throw new Error("Missing quick-action button geometry.");
      }
      return box;
    }),
  );
  let previousBottom = boxes[0].y + boxes[0].height;
  const firstCenterX = boxes[0].x + boxes[0].width / 2;
  for (let index = 1; index < boxes.length; index += 1) {
    const box = boxes[index];
    const centerX = box.x + box.width / 2;
    expect(centerX).toBeGreaterThan(firstCenterX - 2);
    expect(centerX).toBeLessThan(firstCenterX + 2);
    expect(box.y).toBeGreaterThan(previousBottom - 1);
    previousBottom = box.y + box.height;
  }
}

async function setProjectChatSurfaceWidth(
  page: Page,
  widthPx: number,
): Promise<void> {
  const projectChatSurface = await getVisibleProjectChatSurface(page);
  const didSet = await projectChatSurface.evaluate((surface, width) => {
    const panel =
      surface.closest(
        '[data-testid="project-chat-bottom-dock-window-panel"], [data-testid="project-chat-floating-window"], [data-testid="project-chat-maximized-window"]',
      ) ?? surface;
    if (!(panel instanceof HTMLElement)) {
      return false;
    }
    const widthValue = `${width}px`;
    panel.style.width = widthValue;
    panel.style.minWidth = widthValue;
    panel.style.maxWidth = widthValue;
    panel.style.flexBasis = widthValue;
    return true;
  }, widthPx);
  expect(didSet).toBe(true);
}
