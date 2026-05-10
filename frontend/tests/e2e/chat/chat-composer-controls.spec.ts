import { expect, test, type Locator } from "@playwright/test";
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
import {
  expectButtonsStackedVertically,
  findSectionByName,
  getVisibleProjectChatSurface,
  mountManagedChatAreaForSharePolicy,
} from "./chat-composer-control-helpers";

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
      await page.waitForSelector(".setta-gpu-flow__pane");
      await page.evaluate(async () => {
        const { useAIStore, useLocalStorage, useProjectState } = await import(
          "/src/state/definitions.ts"
        );
        const projectConfigId = useProjectState.getState().projectConfig.id;
        useAIStore.setState({ viewThreads: false });
        useLocalStorage.setState((state) => ({
          projectChatAuxViewByProjectConfigId: {
            ...state.projectChatAuxViewByProjectConfigId,
            [projectConfigId]: "none",
          },
        }));
      });

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
      await page.waitForSelector(".setta-gpu-flow__pane");

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
});
