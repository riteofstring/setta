import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  ensureManagedChatEngine,
  ensureProjectChatThreadsPanelVisible,
  getVisibleProjectChatSurface,
  openIsolatedProject,
  seedLocalStorage,
} from "../../helpers";

async function seedAIStorePersistence(
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

async function seedProjectAIChatOverviewState(
  page: Page,
  {
    width,
    viewThreads,
    aiPatch,
  }: {
    width: number;
    viewThreads?: boolean;
    aiPatch?: Record<string, unknown>;
  },
): Promise<void> {
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: width,
    overviewTrueWidth: width,
  });
  if (viewThreads === undefined && aiPatch === undefined) {
    return;
  }
  await seedAIStorePersistence(page, {
    ...(viewThreads === undefined
      ? {}
      : {
          viewThreads,
          projectChatThreadsExplicitlyClosedAtLargeWidth: false,
        }),
    ...(aiPatch ?? {}),
  });
}

async function maximizeProjectChatWindow(page: Page): Promise<void> {
  const maximizedWindow = page
    .getByTestId("project-chat-maximized-window")
    .first();
  if (await maximizedWindow.isVisible()) {
    return;
  }
  const maximizeButton = page
    .getByTestId("project-chat-window-maximize")
    .first();
  await expect(maximizeButton).toBeVisible();
  await clickDom(maximizeButton);
  await expect(maximizedWindow).toBeVisible();
}

async function getOverviewProjectChatSurface(page: Page): Promise<Locator> {
  const overviewSurface = page.locator("#OverviewPane");
  await expect(
    overviewSurface.getByRole("heading", { name: "Project AI Chat" }),
  ).toBeVisible();
  return overviewSurface;
}

async function clickDom(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  await locator.evaluate((element: HTMLElement) => {
    element.click();
  });
}
test("project ai thread spinner clears when latest run in a chat is completed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 920 });
  await seedProjectAIChatOverviewState(page, {
    width: 1040,
    viewThreads: true,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-chat-spinner-old-running",
          profileId: null,
          status: "running",
          startedAt: "2026-01-01T00:00:00Z",
          finishedAt: null,
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId: "pw-thread-spinner-chat",
            engineConfigId: "setta-llm",
            messages: [
              {
                id: "msg-chat-spinner-old-running",
                role: "user",
                content: [{ type: "text", text: "Older in progress prompt" }],
                attachments: [],
              },
            ],
          },
          outputs: null,
          toolCalls: [],
          cost: null,
        },
        {
          id: "run-chat-spinner-latest-completed",
          profileId: null,
          status: "completed",
          startedAt: "2026-01-02T00:00:00Z",
          finishedAt: "2026-01-02T00:00:01Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId: "pw-thread-spinner-chat",
            engineConfigId: "setta-llm",
            messages: [
              {
                id: "msg-chat-spinner-latest-completed",
                role: "user",
                content: [{ type: "text", text: "Latest completed prompt" }],
                attachments: [],
              },
            ],
          },
          outputs: { name: "Latest completed thread", nameSource: "llm" },
          toolCalls: [],
          cost: null,
        },
      ]),
    });
  });
  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");

    const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);

    const completedThreadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Latest completed thread" });
    await expect(completedThreadEntry).toHaveCount(1);
    await expect(
      completedThreadEntry.getByTestId("project-chat-thread-working-indicator"),
    ).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai shows styled empty state when no threads exist", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 920 });
  await seedProjectAIChatOverviewState(page, {
    width: 1040,
    viewThreads: true,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");

    const projectChatSurface = await getVisibleProjectChatSurface(page);
    const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);
    await expect(
      threadsPanel.getByTestId("project-chat-threads-empty-state"),
    ).toBeVisible();
    await expect(
      threadsPanel.getByTestId("project-chat-threads-empty-state-title"),
    ).toContainText("Start a new thread");
    const startNewThreadButton = threadsPanel.getByTestId(
      "project-chat-threads-empty-state-start-thread-button",
    );
    await expect(startNewThreadButton).toBeVisible();
    await startNewThreadButton.click();
    await expect(
      projectChatSurface.getByTestId("chat-input-textarea"),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai thread spinner clears after polling observes run completion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 920 });
  await seedProjectAIChatOverviewState(page, {
    width: 1040,
    viewThreads: true,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  let getAgentRunsCalls = 0;
  await page.route("**/api/getAgentRuns", async (route) => {
    getAgentRunsCalls += 1;
    if (getAgentRunsCalls === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "run-chat-spinner-poll-running",
            profileId: null,
            status: "running",
            startedAt: "2026-01-03T00:00:00Z",
            finishedAt: null,
            events: [],
            inputs: {
              runType: "llm_chat",
              projectConfigId: projectContext.projectConfigId,
              chatId: "pw-thread-spinner-poll-chat",
              engineConfigId: "setta-llm",
              messages: [
                {
                  id: "msg-chat-spinner-poll-running",
                  role: "user",
                  content: [
                    { type: "text", text: "Poll spinner thread prompt" },
                  ],
                  attachments: [],
                },
              ],
            },
            outputs: { name: "Polled spinner thread", nameSource: "llm" },
            toolCalls: [],
            cost: null,
          },
        ]),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-chat-spinner-poll-running",
          profileId: null,
          status: "completed",
          startedAt: "2026-01-03T00:00:00Z",
          finishedAt: "2026-01-03T00:00:01Z",
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId: "pw-thread-spinner-poll-chat",
            engineConfigId: "setta-llm",
            messages: [
              {
                id: "msg-chat-spinner-poll-running",
                role: "user",
                content: [{ type: "text", text: "Poll spinner thread prompt" }],
                attachments: [],
              },
            ],
          },
          outputs: { name: "Polled spinner thread", nameSource: "llm" },
          toolCalls: [],
          cost: null,
        },
      ]),
    });
  });

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");

    const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);

    const polledThreadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Polled spinner thread" });
    await expect(polledThreadEntry).toHaveCount(1);
    await expect.poll(() => getAgentRunsCalls).toBeGreaterThanOrEqual(2);
    await expect(
      polledThreadEntry.getByTestId("project-chat-thread-working-indicator"),
    ).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai selected thread spinner follows live chat state before agent-runs refresh", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1360, height: 920 });
  await seedProjectAIChatOverviewState(page, {
    width: 1040,
    viewThreads: true,
    aiPatch: {
      activeChatId: "pw-thread-live-state-chat",
      chatDetails: {
        "pw-thread-live-state-chat": {
          messages: [
            {
              id: "assistant-live-state",
              role: "assistant",
              content: [{ type: "text", text: "Done responding." }],
            },
          ],
          waitingForResponse: false,
          llmConfig: null,
          toolCallArguments: {},
          contextUsage: null,
        },
      },
    },
  });
  await page.route("**/api/getLLMChat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "assistant-live-state",
            role: "assistant",
            content: [{ type: "text", text: "Done responding." }],
          },
        ],
        waitingForResponse: false,
        llmConfig: null,
      }),
    });
  });
  await page.route("**/api/getExternalAgentChat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "assistant-live-state",
            role: "assistant",
            content: [{ type: "text", text: "Done responding." }],
          },
        ],
        waitingForResponse: false,
        toolCallArguments: {},
        contextUsage: null,
      }),
    });
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  await page.route("**/api/getAgentRuns", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "run-chat-spinner-live-state-running",
          profileId: null,
          status: "running",
          startedAt: "2026-01-04T00:00:00Z",
          finishedAt: null,
          events: [],
          inputs: {
            runType: "llm_chat",
            projectConfigId: projectContext.projectConfigId,
            chatId: "pw-thread-live-state-chat",
            engineConfigId: "setta-llm",
            messages: [
              {
                id: "msg-chat-spinner-live-state-running",
                role: "user",
                content: [{ type: "text", text: "Live state prompt" }],
                attachments: [],
              },
            ],
          },
          outputs: { name: "Live state thread", nameSource: "llm" },
          toolCalls: [],
          cost: null,
        },
      ]),
    });
  });

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");

    const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);

    const selectedThreadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Live state thread" });
    await expect(selectedThreadEntry).toHaveCount(1);
    const selectedThreadWorkingIndicator = selectedThreadEntry.getByTestId(
      "project-chat-thread-working-indicator",
    );
    const selectedThreadDragHandle = selectedThreadEntry.getByTestId(
      "project-chat-thread-drag-handle",
    );
    await expect(selectedThreadWorkingIndicator).toHaveCount(1);
    await expect(selectedThreadWorkingIndicator).toHaveCSS("opacity", "1");
    await expect(selectedThreadDragHandle).toHaveCSS("opacity", "0");
    await selectedThreadEntry.locator("[role='button']").first().focus();
    await expect(selectedThreadWorkingIndicator).toHaveCSS("opacity", "0");
    await expect(selectedThreadDragHandle).toHaveCSS("opacity", "1");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai threads render folder groups and keep pinned scopes separate", async ({
  page,
}) => {
  const backendGroupName =
    "Backend group with a long name for hover truncation checks";
  await page.setViewportSize({ width: 1480, height: 920 });
  await seedProjectAIChatOverviewState(page, {
    width: 1100,
    viewThreads: true,
  });

  await ensureAppReady(page);
  await maximizeProjectChatWindow(page);

  const overviewPane = await getVisibleProjectChatSurface(page);
  const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);
  await expect(threadsPanel).toHaveAttribute("data-inline", "true");
  const threadAgentBadgeToggleButton = overviewPane.getByTestId(
    "project-chat-thread-agent-badge-toggle-button",
  );
  await expect(threadAgentBadgeToggleButton).toBeVisible();
  const threadHeaderGeometry = await overviewPane.evaluate((paneElement) => {
    const headerHost = paneElement.querySelector(
      '[data-testid="project-chat-inline-threads-header-host"]',
    );
    const inlineHeaderShell = headerHost?.parentElement;
    const nav = paneElement.querySelector("nav");
    const badgeToggleButton = paneElement.querySelector(
      '[data-testid="project-chat-thread-agent-badge-toggle-button"]',
    );
    if (
      !(inlineHeaderShell instanceof HTMLElement) ||
      !(nav instanceof HTMLElement) ||
      !(badgeToggleButton instanceof HTMLElement)
    ) {
      return null;
    }
    const shellRect = inlineHeaderShell.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    return {
      dividerBottomDelta: navRect.bottom - shellRect.bottom,
      badgeToggleClasses: badgeToggleButton.className,
    };
  });
  expect(threadHeaderGeometry).not.toBeNull();
  if (!threadHeaderGeometry) {
    throw new Error(
      "Expected project chat inline threads header geometry to be measurable.",
    );
  }
  // Keep the inline threads divider continuous with the header bottom border.
  expect(Math.abs(threadHeaderGeometry.dividerBottomDelta)).toBeLessThanOrEqual(
    1,
  );
  // Category toggle should follow the standard transparent toolbar button style.
  expect(threadHeaderGeometry.badgeToggleClasses).toContain("bg-transparent");
  expect(threadHeaderGeometry.badgeToggleClasses).toContain("text-xs");
  expect(threadHeaderGeometry.badgeToggleClasses).toContain("font-semibold");
  expect(threadHeaderGeometry.badgeToggleClasses).toContain("text-setta-600");
  expect(threadHeaderGeometry.badgeToggleClasses).toContain(
    "dark:text-setta-300",
  );
  const masterSearchInput = overviewPane.getByTestId(
    "project-chat-master-search-input",
  );
  await expect(masterSearchInput).toBeVisible();
  await expect(overviewPane.getByTestId("chat-input-textarea")).toBeVisible();
  await expect(
    threadsPanel.getByTestId("project-chat-thread-group-select"),
  ).toHaveCount(0);
  const attachmentButton = overviewPane.getByRole("button", {
    name: "Attachment options",
  });
  await expect(attachmentButton).toBeVisible();
  // Ensure thread-header controls stay inside their header host and do not
  // overlap chat controls when pane widths change.
  const assertInlineThreadHeaderHasNoOverflow = async (): Promise<void> => {
    await expect
      .poll(async () => {
        return await overviewPane.evaluate((paneElement) => {
          const headerHost = paneElement.querySelector(
            '[data-testid="project-chat-inline-threads-header-host"]',
          );
          const toolbar = paneElement.querySelector(
            '[data-testid="project-chat-threads-toolbar"]',
          );
          if (
            !(headerHost instanceof HTMLElement) ||
            !(toolbar instanceof HTMLElement)
          ) {
            return Number.POSITIVE_INFINITY;
          }
          const hostRight = headerHost.getBoundingClientRect().right;
          const controls = Array.from(
            toolbar.querySelectorAll("button, search"),
          );
          const maxControlRight = controls.reduce((maxRight, control) => {
            if (!(control instanceof HTMLElement)) {
              return maxRight;
            }
            return Math.max(maxRight, control.getBoundingClientRect().right);
          }, toolbar.getBoundingClientRect().right);
          return maxControlRight - hostRight;
        });
      })
      .toBeLessThanOrEqual(0.5);
  };
  await assertInlineThreadHeaderHasNoOverflow();
  await expect
    .poll(async () => {
      const panelBox = await threadsPanel.boundingBox();
      const attachmentBox = await attachmentButton.boundingBox();
      if (!panelBox || !attachmentBox) {
        return null;
      }
      return attachmentBox.x - (panelBox.x + panelBox.width);
    })
    .toBeGreaterThanOrEqual(0);
  const resizeHandle = overviewPane.getByTestId(
    "project-chat-inline-threads-resize-handle",
  );
  await expect(resizeHandle).toBeVisible();

  const resizeHandleBox = await resizeHandle.boundingBox();
  if (!resizeHandleBox) {
    throw new Error("Threads resize handle box was not available.");
  }
  const handleCenterX = resizeHandleBox.x + resizeHandleBox.width / 2;
  const handleCenterY = resizeHandleBox.y + resizeHandleBox.height / 2;
  await page.mouse.move(handleCenterX, handleCenterY);
  await page.mouse.down();
  await page.mouse.move(handleCenterX + 80, handleCenterY);
  await page.mouse.up();

  await assertInlineThreadHeaderHasNoOverflow();

  await clickDom(overviewPane.getByRole("button", { name: "New Group" }));
  const groupNameInput = threadsPanel.getByTestId(
    "project-chat-thread-group-name-input",
  );
  await expect(groupNameInput).toBeVisible();
  await groupNameInput.fill(backendGroupName);
  await groupNameInput.press("Enter");
  const backendGroupRow = threadsPanel
    .getByTestId("project-chat-thread-group-row")
    .filter({ hasText: backendGroupName });
  await expect(backendGroupRow).toBeVisible();
  const backendGroupSelect = backendGroupRow.getByTestId(
    "project-chat-thread-group-select",
  );
  await expect(
    backendGroupRow.getByTestId("project-chat-thread-group-new-chat-button"),
  ).toBeVisible();
  await clickDom(
    backendGroupRow.getByTestId("project-chat-thread-group-new-chat-button"),
  );
  const draftThreadEntry = backendGroupRow.getByTestId(
    "project-chat-thread-draft-entry",
  );
  await expect(draftThreadEntry).toHaveCount(1);
  const draftDragHandle = draftThreadEntry.getByTestId(
    "project-chat-thread-drag-handle",
  );
  await expect(draftDragHandle).toHaveCSS("opacity", "0");
  await draftThreadEntry.getByRole("button").focus();
  await expect(draftDragHandle).toHaveCSS("opacity", "1");
  const draftEntrySpacing = await backendGroupRow
    .getByTestId("project-chat-thread-draft-entry")
    .evaluate((entryElement) => {
      const rowButton = entryElement.querySelector("[role='button']");
      const handle = entryElement.querySelector(
        "[data-testid='project-chat-thread-drag-handle']",
      );
      const label = rowButton?.querySelector("span.truncate");
      if (
        !(rowButton instanceof HTMLElement) ||
        !(handle instanceof HTMLElement) ||
        !(label instanceof HTMLElement)
      ) {
        throw new Error("Expected thread row spacing elements.");
      }
      const rowButtonRect = rowButton.getBoundingClientRect();
      const handleRect = handle.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      return {
        leftToHandle: handleRect.left - rowButtonRect.left,
        handleToLabel: labelRect.left - handleRect.right,
      };
    });
  expect(draftEntrySpacing.leftToHandle).toBeLessThanOrEqual(0.75);
  expect(draftEntrySpacing.handleToLabel).toBeLessThanOrEqual(1.5);
  await clickDom(backendGroupSelect);
  await expect(
    backendGroupRow.getByTestId("project-chat-thread-draft-entry"),
  ).toHaveCount(0);
  await clickDom(backendGroupSelect);
  await expect(
    backendGroupRow.getByTestId("project-chat-thread-draft-entry"),
  ).toHaveCount(1);

  await clickDom(overviewPane.getByRole("button", { name: "New Group" }));
  await expect(groupNameInput).toBeVisible();
  await groupNameInput.fill("Frontend");
  await groupNameInput.press("Enter");
  await expect(
    threadsPanel
      .getByTestId("project-chat-thread-group-row")
      .filter({ hasText: "Frontend" }),
  ).toBeVisible();

  await clickDom(overviewPane.getByRole("button", { name: "New Group" }));
  await expect(groupNameInput).toBeVisible();
  await groupNameInput.fill("Ops");
  await groupNameInput.press("Enter");
  await expect(
    threadsPanel
      .getByTestId("project-chat-thread-group-row")
      .filter({ hasText: "Ops" }),
  ).toBeVisible();

  const frontendHandle = threadsPanel
    .getByTestId("project-chat-thread-group-row")
    .filter({ hasText: "Frontend" })
    .getByTestId("project-chat-thread-group-drag-handle");

  const backendGroupRowForPin = threadsPanel
    .getByTestId("project-chat-thread-group-row")
    .filter({ hasText: backendGroupName });
  const backendGroupPinButton = backendGroupRowForPin.getByTestId(
    "project-chat-thread-group-pin-button",
  );
  await backendGroupPinButton.evaluate((element: HTMLElement) => {
    element.click();
  });
  await expect(
    threadsPanel.getByTestId("project-chat-pinned-groups-label"),
  ).toBeVisible();
  await expect(
    threadsPanel.getByTestId("project-chat-unpinned-groups-label"),
  ).toBeVisible();

  await expect
    .poll(async () => {
      return await threadsPanel
        .getByTestId("project-chat-thread-group-row")
        .evaluateAll((elements) => {
          return elements
            .map((element) => {
              const titleEl = element.querySelector("span.truncate");
              return titleEl?.textContent?.trim() ?? "";
            })
            .filter((value) => value.length > 0);
        });
    })
    .toEqual([backendGroupName, "Frontend", "Ops"]);

  // Pinned and unpinned groups should be reorderable only within their own
  // peer sections.
  const frontendPinnedDragHandleBox = await frontendHandle.boundingBox();
  const pinnedGroupsLabel = threadsPanel.getByTestId(
    "project-chat-pinned-groups-label",
  );
  const pinnedGroupsLabelBox = await pinnedGroupsLabel.boundingBox();
  if (!frontendPinnedDragHandleBox || !pinnedGroupsLabelBox) {
    throw new Error("Expected drag bounding boxes to be available.");
  }
  await page.mouse.move(
    frontendPinnedDragHandleBox.x + frontendPinnedDragHandleBox.width / 2,
    frontendPinnedDragHandleBox.y + frontendPinnedDragHandleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    pinnedGroupsLabelBox.x + pinnedGroupsLabelBox.width / 2,
    pinnedGroupsLabelBox.y + pinnedGroupsLabelBox.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => {
      return await threadsPanel
        .getByTestId("project-chat-thread-group-row")
        .evaluateAll((elements) => {
          return elements
            .map((element) => {
              const titleEl = element.querySelector("span.truncate");
              return titleEl?.textContent?.trim() ?? "";
            })
            .filter((value) => value.length > 0);
        });
    })
    .toEqual([backendGroupName, "Frontend", "Ops"]);
});

test("project ai threads remember explicit large-width close after narrow resize", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 700,
    overviewTrueWidth: 700,
  });
  await seedAIStorePersistence(page, {
    viewThreads: false,
    projectChatThreadsExplicitlyClosedAtLargeWidth: false,
  });

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    let overviewPane = await getOverviewProjectChatSurface(page);
    const fullscreenButton = page.getByTestId(
      "overview-pane-fullscreen-button",
    );
    await fullscreenButton.click();
    overviewPane = await getOverviewProjectChatSurface(page);
    const inlineThreadsPanel = overviewPane.getByTestId(
      "project-chat-threads-panel",
    );
    await expect(inlineThreadsPanel).toBeVisible();
    await expect(inlineThreadsPanel).toHaveAttribute("data-inline", "true");

    await clickDom(overviewPane.getByRole("button", { name: "View Threads" }));
    await expect(
      overviewPane.getByTestId("project-chat-threads-panel"),
    ).toHaveCount(0);

    const explicitClosePersisted = await page.evaluate(() => {
      const raw = window.localStorage.getItem("setta_ai_data");
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
      return (
        parsed.state?.projectChatThreadsExplicitlyClosedAtLargeWidth ?? null
      );
    });
    expect(explicitClosePersisted).toBe(true);

    await fullscreenButton.click();
    overviewPane = await getOverviewProjectChatSurface(page);
    await expect(
      overviewPane.getByTestId("project-chat-threads-panel"),
    ).toHaveCount(0);
    await fullscreenButton.click();
    overviewPane = await getOverviewProjectChatSurface(page);
    await expect(
      overviewPane.getByTestId("project-chat-threads-panel"),
    ).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai preserves draft text when resize reveals inline threads", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 920 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 700,
    overviewTrueWidth: 700,
  });
  await seedAIStorePersistence(page, {
    viewThreads: false,
    projectChatThreadsExplicitlyClosedAtLargeWidth: false,
  });

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".setta-gpu-flow__pane");

    let overviewPane = await getOverviewProjectChatSurface(page);
    let composerInput = overviewPane.getByTestId("chat-input-textarea");
    await expect(composerInput).toBeVisible();
    const draftText = "keep this draft while resizing";
    await composerInput.fill(draftText);
    await expect(composerInput).toHaveValue(draftText);

    await page.getByTestId("overview-pane-fullscreen-button").click();
    overviewPane = await getOverviewProjectChatSurface(page);
    const inlineThreadsPanel = overviewPane.getByTestId(
      "project-chat-threads-panel",
    );
    await expect(inlineThreadsPanel).toBeVisible();
    await expect(inlineThreadsPanel).toHaveAttribute("data-inline", "true");
    composerInput = overviewPane.getByTestId("chat-input-textarea");
    await expect(composerInput).toHaveValue(draftText);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai preserves unsent draft text across reloads", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 920 });
  await seedProjectAIChatOverviewState(page, {
    width: 1040,
  });

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);

  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".setta-gpu-flow__pane");

    const overviewPane = await getOverviewProjectChatSurface(page);
    const composerInput = overviewPane.getByTestId("chat-input-textarea");
    const draftText = "  keep this unsent draft after reload  \n";
    await composerInput.fill(draftText);
    await expect(composerInput).toHaveValue(draftText);

    // Reload should keep the in-progress composer text instead of resetting the
    // controlled input back to an empty project chat draft.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".setta-gpu-flow__pane");

    const reloadedOverviewPane = await getOverviewProjectChatSurface(page);
    await expect(
      reloadedOverviewPane.getByTestId("chat-input-textarea"),
    ).toHaveValue(draftText);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai conversation search dedupes duplicate terms and ignores code-only matches", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 920 });
  await seedProjectAIChatOverviewState(page, {
    width: 1040,
    viewThreads: true,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);
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
  const primaryConfig =
    engineConfigs.find((config) => config.engineType === "setta_llm") ??
    engineConfigs[0];
  if (!primaryConfig) {
    throw new Error("Expected at least one engine config for search test.");
  }

  try {
    await page.route("**/api/getAgentRuns", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "run-search-thread",
            profileId: null,
            status: "completed",
            startedAt: "2026-01-12T00:00:00Z",
            finishedAt: "2026-01-12T00:00:02Z",
            events: [],
            inputs: {
              runType: "llm_chat",
              projectConfigId: projectContext.projectConfigId,
              chatId: "chat-search-thread",
              engineConfigId: primaryConfig.id,
              messages: [
                {
                  id: "search-thread-user",
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: "Kickoff request",
                    },
                  ],
                  attachments: [],
                },
              ],
            },
            outputs: {
              name: "Search thread",
              nameSource: "llm",
            },
            toolCalls: [],
            cost: null,
          },
        ]),
      });
    });
    await page.route("**/api/getLLMChat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [
            {
              id: "search-thread-user",
              role: "user",
              content: [{ type: "text", text: "Kickoff request" }],
              attachments: [],
            },
            {
              id: "search-thread-assistant",
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "Visible queue reply queue follow up\n\n```txt\nqueue hidden in code\n```",
                },
              ],
              attachments: [],
            },
          ],
          waitingForResponse: false,
          llmConfig: null,
        }),
      });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".setta-gpu-flow__pane");

    const overviewPane = await getVisibleProjectChatSurface(page);
    const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);
    const searchThreadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Search thread" })
      .first();
    await expect(searchThreadEntry).toBeVisible();
    await clickDom(searchThreadEntry);

    const conversationFilterInput = overviewPane.getByTestId(
      "project-chat-conversation-filter-input",
    );
    await conversationFilterInput.fill("queue queue");
    await expect(
      overviewPane.getByTestId("project-chat-conversation-filter"),
    ).toContainText("1/2");

    const activeSearchMatch = overviewPane.locator(
      '[data-chat-search-active-match="true"]',
    );
    await expect(activeSearchMatch).toContainText(
      "Visible queue reply queue follow up",
    );
    await expect
      .poll(async () => {
        return await activeSearchMatch.evaluate((element) => {
          return element.querySelectorAll(
            'mark[data-chat-search-highlight="true"]',
          ).length;
        });
      })
      .toBe(2);

    await conversationFilterInput.press("Enter");
    await expect(
      overviewPane.getByTestId("project-chat-conversation-filter"),
    ).toContainText("2/2");
    await expect
      .poll(async () => {
        return await activeSearchMatch.evaluate((element) => {
          const marks = Array.from(
            element.querySelectorAll('mark[data-chat-search-highlight="true"]'),
          );
          return marks.findIndex((mark) =>
            mark.hasAttribute("data-chat-search-highlight-target"),
          );
        });
      })
      .toBe(1);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai conversation search ignores hidden tool payloads and counts visible activity labels", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 920 });
  await seedProjectAIChatOverviewState(page, {
    width: 1040,
    viewThreads: true,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const engineCleanup = await ensureManagedChatEngine(page);
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
  const primaryConfig =
    engineConfigs.find((config) => config.engineType === "setta_llm") ??
    engineConfigs[0];
  if (!primaryConfig) {
    throw new Error("Expected at least one engine config for search test.");
  }

  try {
    await page.route("**/api/getAgentRuns", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "run-tool-search-thread",
            profileId: null,
            status: "completed",
            startedAt: "2026-01-12T00:00:00Z",
            finishedAt: "2026-01-12T00:00:02Z",
            events: [],
            inputs: {
              runType: "llm_chat",
              projectConfigId: projectContext.projectConfigId,
              chatId: "chat-tool-search-thread",
              engineConfigId: primaryConfig.id,
              messages: [],
            },
            outputs: {
              name: "Tool search thread",
              nameSource: "llm",
            },
            toolCalls: [],
            cost: null,
          },
        ]),
      });
    });
    await page.route("**/api/getLLMChat", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          messages: [
            {
              id: "tool-search-assistant",
              role: "assistant",
              content: [],
              attachments: [],
              tool_calls: [
                {
                  id: "tool-search-call",
                  type: "function",
                  function: {
                    name: "file_change",
                    arguments: {
                      path: "notes.txt",
                      diff: "secret payload",
                    },
                  },
                },
              ],
            },
          ],
          waitingForResponse: false,
          llmConfig: null,
        }),
      });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".setta-gpu-flow__pane");

    const overviewPane = await getVisibleProjectChatSurface(page);
    const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);
    const searchThreadEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Tool search thread" })
      .first();
    await expect(searchThreadEntry).toBeVisible();
    await clickDom(searchThreadEntry);

    const conversationFilterInput = overviewPane.getByTestId(
      "project-chat-conversation-filter-input",
    );
    await conversationFilterInput.fill("secret");
    await expect(
      overviewPane.getByTestId("project-chat-conversation-filter"),
    ).toContainText("0/0");
    await expect(
      overviewPane.locator('mark[data-chat-search-highlight="true"]'),
    ).toHaveCount(0);

    await conversationFilterInput.fill("notes");
    await expect(
      overviewPane.getByTestId("project-chat-conversation-filter"),
    ).toContainText("1/1");
    await expect(
      overviewPane.locator(
        'mark[data-chat-search-highlight="true"][data-chat-search-highlight-target="true"]',
      ),
    ).toHaveCount(1);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});
