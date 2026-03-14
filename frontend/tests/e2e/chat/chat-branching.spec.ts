import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChatSection,
  ensureAppReady,
  ensureManagedChatEngine,
  openIsolatedProject,
  setChatSectionState,
  setOverviewTab,
  stopLatestProjectChat,
} from "../helpers";

type EngineConfigSummary = {
  id: string;
  engineType: string;
};

test.describe.serial("chat branching", () => {
  test("project chat edit creates branch and switcher", async ({ page }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    const engineCleanup = await ensureManagedChatEngine(page);

    try {
      await page.reload();
      await page.waitForSelector(".react-flow__pane");

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
      await page.evaluate(async (nextEngineId) => {
        const { useAIStore } = await import("/src/state/definitions.ts");
        useAIStore.setState({ projectChatSelectedEngineId: nextEngineId });
      }, managedEngineId);

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await projectChatSurface.getByRole("button", { name: "Thinking" }).click();

      const input = projectChatSurface.getByPlaceholder("Type a message...");
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();

      await input.fill("Original message");
      await input.press("Enter");

      const originalGroup = getMessageGroup(
        projectChatSurface,
        "Original message",
      );
      await expect(originalGroup).toBeVisible();
      await expect(input).toHaveValue("", { timeout: 20000 });

      await stopLatestProjectChat(page, projectContext.projectConfigId);

      await page.reload();
      await page.waitForSelector(".react-flow__pane");
      const reloadedProjectChatSurface = await getVisibleProjectChatSurface(
        page,
      );
      await reloadedProjectChatSurface
        .getByRole("button", { name: "Thinking" })
        .click();

      await reloadedProjectChatSurface
        .getByRole("button", { name: "View Threads" })
        .click();

      const historyEntry = reloadedProjectChatSurface
        .getByTestId("project-chat-thread-entry")
        .filter({ hasText: "Original message" })
        .first();
      await expect(historyEntry).toBeVisible();
      await historyEntry.click();

      const chatInput = reloadedProjectChatSurface.getByPlaceholder(
        "Type a message...",
      );
      await expect(chatInput).toBeEnabled({ timeout: 20000 });

      const originalMessageId = await getMessageGroupId(
        reloadedProjectChatSurface,
        "Original message",
      );
      const reloadedOriginalGroup = getMessageGroupById(
        reloadedProjectChatSurface,
        originalMessageId,
      );
      await expect(reloadedOriginalGroup).toBeVisible();

      await reloadedOriginalGroup.hover();
      const editButton = reloadedOriginalGroup.getByRole("button", {
        name: "Edit message",
      });
      await expect(editButton).toBeVisible();
      await expect(editButton).toBeEnabled({ timeout: 20000 });
      await editButton.click();

      const editor = reloadedOriginalGroup.getByLabel("Edit message");
      await expect(editor).toBeVisible();
      const editorLayout = await getEditLayout(
        editor,
        reloadedOriginalGroup.getByRole("button", {
          name: "Attachment options",
        }),
      );
      expect(editorLayout.paddingLeft).toBeGreaterThanOrEqual(36);
      expect(editorLayout.buttonRight).toBeLessThan(editorLayout.textStartX);
      await editor.fill("Edited message");
      await reloadedOriginalGroup
        .getByRole("button", { name: "Save" })
        .click();

      const editedGroup = getMessageGroup(
        reloadedProjectChatSurface,
        "Edited message",
      );
      await expect(editedGroup).toBeVisible();
      await editedGroup.hover();
      await expect(editedGroup.getByText("2/2")).toBeVisible();
      const previousBranchButton = editedGroup.getByRole("button", {
        name: "Previous branch",
      });
      await expect(previousBranchButton).toBeVisible();
      await expectLocatorCenterPointToBeReachable(previousBranchButton);
      await previousBranchButton.click();

      const revertedGroup = getMessageGroup(
        reloadedProjectChatSurface,
        "Original message",
      );
      await expect(revertedGroup).toBeVisible();
      await revertedGroup.hover();
      await expect(revertedGroup.getByText("1/2")).toBeVisible();
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("chat section edit creates branch and switcher", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId, sectionName } = await createChatSection(
        page,
        projectContext.projectConfigId,
        "__pw_branch_section__",
      );

      const section = findSectionByName(page, sectionName);
      await expect(section).toBeVisible();

      await setChatSectionState(page, {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        state: {
          messages: [
            {
              id: "msg-1",
              role: "user",
              content: [{ type: "text", text: "Original section" }],
              attachments: [],
            },
          ],
          inputText: "",
          waitingForResponse: false,
          toolCallArguments: {},
        },
      });

      const originalMessageId = await getMessageGroupId(
        section,
        "Original section",
      );
      const originalGroup = getMessageGroupById(section, originalMessageId);
      await expect(originalGroup).toBeVisible();

      await originalGroup.hover();
      await originalGroup
        .getByRole("button", { name: "Edit message" })
        .evaluate((element: HTMLButtonElement) => element.click());

      const editor = originalGroup.getByLabel("Edit message");
      await expect(editor).toBeVisible();
      await editor.fill("Edited section");
      await originalGroup.getByRole("button", { name: "Save" }).click();

      const editedGroup = getMessageGroup(section, "Edited section");
      await expect(editedGroup).toBeVisible();
      await editedGroup.hover();
      await expect(editedGroup.getByText("2/2")).toBeVisible();
      const previousBranchButton = editedGroup.getByRole("button", {
        name: "Previous branch",
      });
      await expect(previousBranchButton).toBeVisible();
      await expectLocatorCenterPointToBeReachable(previousBranchButton);
      await previousBranchButton.click();

      const revertedGroup = getMessageGroup(section, "Original section");
      await expect(revertedGroup).toBeVisible();
      await revertedGroup.hover();
      await expect(revertedGroup.getByText("1/2")).toBeVisible();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("project chat redo regenerates from the source user message", async ({
    page,
  }) => {
    await setOverviewTab(page, "ProjectAIChat");
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    const engineCleanup = await ensureManagedChatEngine(page);
    const rootChatId = "pw-redo-root-chat";
    const branchChatId = "pw-redo-branch-chat";
    const sourceUserMessageId = "pw-redo-user-message";
    const rootMessages = [
      {
        id: sourceUserMessageId,
        role: "user",
        content: [{ type: "text", text: "Original message" }],
        attachments: [],
      },
      {
        id: "pw-redo-assistant-root",
        role: "assistant",
        content: [{ type: "text", text: "Initial assistant answer." }],
        attachments: [],
        tool_calls: null,
      },
    ];
    const branchMessages = [
      {
        id: sourceUserMessageId,
        role: "user",
        content: [{ type: "text", text: "Original message" }],
        attachments: [],
      },
      {
        id: "pw-redo-assistant-branch",
        role: "assistant",
        content: [{ type: "text", text: "Regenerated assistant answer." }],
        attachments: [],
        tool_calls: null,
      },
    ];
    let sawRedoBranchRequest = false;

    await page.route("**/api/getLLMResponse", async (route) => {
      const payload = route.request().postDataJSON() as
        | {
            branchParentChatId?: string | null;
            branchFromMessageId?: string | null;
          }
        | undefined;
      if (
        payload?.branchParentChatId === rootChatId &&
        payload?.branchFromMessageId === sourceUserMessageId
      ) {
        sawRedoBranchRequest = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(branchChatId),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(rootChatId),
      });
    });

    await page.route("**/api/getLLMChat", async (route) => {
      const payload = route.request().postDataJSON() as
        | { chatId?: string }
        | undefined;
      const requestedChatId =
        typeof payload?.chatId === "string" ? payload.chatId : null;
      const responseBody =
        requestedChatId === branchChatId
          ? {
              messages: branchMessages,
              waitingForResponse: false,
              llmConfig: {
                id: "pw-redo-config",
                model: "gpt-4o-mini",
                provider: "openai",
                api_key_env: null,
                base_url: null,
                other_params: null,
                mcpServerIds: null,
                temporary: false,
              },
              contextUsage: null,
            }
          : {
              messages: rootMessages,
              waitingForResponse: false,
              llmConfig: {
                id: "pw-redo-config",
                model: "gpt-4o-mini",
                provider: "openai",
                api_key_env: null,
                base_url: null,
                other_params: null,
                mcpServerIds: null,
                temporary: false,
              },
              contextUsage: null,
            };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(responseBody),
      });
    });
    await page.route("**/api/getExternalAgentChat", async (route) => {
      const payload = route.request().postDataJSON() as
        | { chatId?: string }
        | undefined;
      const requestedChatId =
        typeof payload?.chatId === "string" ? payload.chatId : null;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages:
            requestedChatId === branchChatId ? branchMessages : rootMessages,
          waitingForResponse: false,
          toolCallArguments: {},
          contextUsage: null,
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

    try {
      await page.reload();
      await page.waitForSelector(".react-flow__pane");

      const projectChatSurface = await getVisibleProjectChatSurface(page);
      await projectChatSurface.getByRole("button", { name: "Thinking" }).click();
      const windowInstanceId = await getVisibleProjectChatWindowInstanceId(
        projectChatSurface,
      );
      await page.evaluate(
        async ({ chatId, instanceId, messages }) => {
          const { setProjectChatWindowChatId } = await import(
            "/src/state/actions/projectChatWindowing.ts"
          );
          const { useAIStore } = await import("/src/state/definitions.ts");
          useAIStore.setState((state) => ({
            chatDetails: {
              ...state.chatDetails,
              [chatId]: {
                messages,
                toolCallArguments: {},
                waitingForResponse: false,
                llmConfig: null,
                contextUsage: null,
              },
            },
          }));
          setProjectChatWindowChatId(instanceId, chatId);
        },
        {
          chatId: rootChatId,
          instanceId: windowInstanceId,
          messages: rootMessages,
        },
      );

      const assistantGroup = getMessageGroup(
        projectChatSurface,
        "Initial assistant answer.",
      );
      await expect(assistantGroup).toBeVisible();
      await assistantGroup.hover();
      const redoButton = assistantGroup.getByRole("button", {
        name: "Redo response",
      });
      await expect(redoButton).toBeVisible();
      await expect(redoButton).toBeEnabled();
      await redoButton.click();

      await expect.poll(() => sawRedoBranchRequest).toBe(true);
      await expect(
        getMessageGroup(projectChatSurface, "Regenerated assistant answer."),
      ).toBeVisible();
    } finally {
      await engineCleanup();
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});

async function getVisibleProjectChatSurface(page: Page): Promise<Locator> {
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

async function getVisibleProjectChatWindowInstanceId(
  surface: Locator,
): Promise<string> {
  const instanceId = await surface.getAttribute("data-chat-window-instance-id");
  if (!instanceId) {
    throw new Error("Visible project chat surface is missing an instance id.");
  }
  return instanceId;
}

function getMessageGroup(container: Locator, text: string): Locator {
  return container.locator("div.group").filter({ hasText: text }).first();
}

function getMessageGroupById(container: Locator, messageId: string): Locator {
  return container
    .locator(`div.group[data-message-id="${messageId}"]`)
    .first();
}

async function getMessageGroupId(
  container: Locator,
  text: string,
): Promise<string> {
  const group = getMessageGroup(container, text);
  const messageId = await group.getAttribute("data-message-id");
  if (!messageId) {
    throw new Error(`Missing message id for text: ${text}`);
  }
  return messageId;
}

async function getEditLayout(
  editor: Locator,
  button: Locator,
): Promise<{
  paddingLeft: number;
  textStartX: number;
  buttonRight: number;
}> {
  const buttonHandle = await button.elementHandle();
  if (!buttonHandle) {
    throw new Error("Missing attachment options button.");
  }
  return editor.evaluate((element, buttonEl) => {
    const editorRect = element.getBoundingClientRect();
    const buttonRect = buttonEl.getBoundingClientRect();
    const paddingLeft = Number.parseFloat(
      window.getComputedStyle(element).paddingLeft,
    );
    return {
      paddingLeft,
      textStartX: editorRect.left + paddingLeft,
      buttonRight: buttonRect.right,
    };
  }, buttonHandle);
}

async function expectLocatorCenterPointToBeReachable(
  locator: Locator,
): Promise<void> {
  await expect
    .poll(async () => {
      return await locator.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return false;
        }
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(centerX, centerY);
        return hit ? element.contains(hit) : false;
      });
    })
    .toBe(true);
}

function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) })
    .first();
}
