import { expect, test, type Locator, type Page } from "@playwright/test";
import {
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
        section.getByText("Unknown or unavailable command. Use /help."),
      ).toBeVisible();
      await input.fill("/permissions yolo");
      await input.press("Enter");
      await expect(
        section.getByText("Unknown or unavailable command. Use /help."),
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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("chat-anthropic-thinking"),
      });
    });

    try {
      const llmConfigResponse = await page.request.get(
        `${backendOrigin}/api/llm/config`,
      );
      expect(llmConfigResponse.ok()).toBe(true);
      initialLLMConfig = (await llmConfigResponse.json()) as LLMConfigPayload;

      const anthropicConfigId = `e2e-anthropic-thinking-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [anthropicConfigId]: {
            model: "claude-sonnet-4-5-20250929",
            provider: "anthropic",
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
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify("chat-gemini-thinking"),
      });
    });

    try {
      const llmConfigResponse = await page.request.get(
        `${backendOrigin}/api/llm/config`,
      );
      expect(llmConfigResponse.ok()).toBe(true);
      initialLLMConfig = (await llmConfigResponse.json()) as LLMConfigPayload;

      const geminiConfigId = `e2e-gemini-thinking-${Date.now()}`;
      const updatedLLMConfig: LLMConfigPayload = {
        ...initialLLMConfig,
        configs: {
          ...initialLLMConfig.configs,
          [geminiConfigId]: {
            model: "gemini-2.5-pro",
            provider: "gemini",
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

  test("project chat collapses nav labels below the toolbar label breakpoint", async ({
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
      const settingsVisibleLabel = projectChatSurface
        .getByRole("button", { name: "Project AI Settings" })
        .locator("span", { hasText: /^Settings$/ })
        .first();

      await setProjectChatSurfaceWidth(page, 820);
      await expect(historyVisibleLabel).toBeVisible();
      await expect(settingsVisibleLabel).toBeVisible();

      await setProjectChatSurfaceWidth(page, 700);
      await expect(historyVisibleLabel).toBeHidden();
      await expect(settingsVisibleLabel).toBeHidden();
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
