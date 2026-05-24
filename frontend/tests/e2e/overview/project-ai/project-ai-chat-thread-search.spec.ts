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
test("project ai ignores legacy viewHistory in persisted ai store", async ({
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
    viewHistory: true,
    projectChatThreadsExplicitlyClosedAtLargeWidth: false,
  });

  await ensureAppReady(page);

  const overviewPane = await getOverviewProjectChatSurface(page);

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const raw = window.localStorage.getItem("setta_ai_data");
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
        const state = parsed.state ?? {};
        return Object.prototype.hasOwnProperty.call(state, "viewHistory");
      });
    })
    .toBe(false);
});

test("project ai new thread placeholder stays inline, clears when unused, and promotes to a titled thread", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1480, height: 920 });
  await seedProjectAIChatOverviewState(page, {
    width: 1100,
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
    throw new Error("Expected at least one engine config for thread test.");
  }
  const primaryRunType =
    primaryConfig.engineType === "external_agent"
      ? "external_agent"
      : "llm_chat";

  await page.route("**/api/getAgentRuns", async (route) => {
    const runs = [
      {
        id: `run-existing-new-${primaryConfig.id}`,
        profileId: null,
        status: "running",
        startedAt: "2026-01-12T00:00:00Z",
        finishedAt: null,
        events: [],
        inputs: {
          runType: primaryRunType,
          projectConfigId: projectContext.projectConfigId,
          chatId: `pw-existing-thread-new-${primaryConfig.id}`,
          engineConfigId: primaryConfig.id,
          messages: [
            {
              id: `msg-existing-new-${primaryConfig.id}`,
              role: "user",
              content: [{ type: "text", text: "Queue backlog item alpha" }],
              attachments: [],
            },
          ],
        },
        outputs: { name: "Existing thread new", nameSource: "llm" },
        toolCalls: [],
        cost: null,
      },
      {
        id: `run-existing-middle-${primaryConfig.id}`,
        profileId: null,
        status: "completed",
        startedAt: "2026-01-11T00:00:00Z",
        finishedAt: "2026-01-11T00:00:01Z",
        events: [],
        inputs: {
          runType: primaryRunType,
          projectConfigId: projectContext.projectConfigId,
          chatId: `pw-existing-thread-middle-${primaryConfig.id}`,
          engineConfigId: primaryConfig.id,
          messages: [
            {
              id: `msg-existing-middle-${primaryConfig.id}`,
              role: "user",
              content: [{ type: "text", text: "Design review beta scope" }],
              attachments: [],
            },
          ],
        },
        outputs: { name: "Existing thread middle", nameSource: "llm" },
        toolCalls: [],
        cost: null,
      },
      {
        id: `run-existing-old-${primaryConfig.id}`,
        profileId: null,
        status: "completed",
        startedAt: "2026-01-10T00:00:00Z",
        finishedAt: "2026-01-10T00:00:01Z",
        events: [],
        inputs: {
          runType: primaryRunType,
          projectConfigId: projectContext.projectConfigId,
          chatId: `pw-existing-thread-old-${primaryConfig.id}`,
          engineConfigId: primaryConfig.id,
          messages: [
            {
              id: `msg-existing-old-${primaryConfig.id}`,
              role: "user",
              content: [{ type: "text", text: "Operations incident gamma" }],
              attachments: [],
            },
          ],
        },
        outputs: { name: "Existing thread old", nameSource: "llm" },
        toolCalls: [],
        cost: null,
      },
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(runs),
    });
  });
  await page.route("**/api/getExternalAgentChat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "user-existing",
            role: "user",
            content: [{ type: "text", text: "Nonmatching kickoff request" }],
          },
          {
            id: "assistant-existing",
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Existing queue thread reply queue follow up",
              },
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
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        messages: [
          {
            id: "user-existing",
            role: "user",
            content: [{ type: "text", text: "Nonmatching kickoff request" }],
          },
          {
            id: "assistant-existing",
            role: "assistant",
            content: [
              {
                type: "text",
                text: "Existing queue thread reply queue follow up",
              },
            ],
          },
        ],
        waitingForResponse: false,
        llmConfig: null,
      }),
    });
  });

  try {
    await page.reload();
    await page.waitForSelector(".setta-gpu-flow__pane");

    await maximizeProjectChatWindow(page);
    const overviewPane = await getVisibleProjectChatSurface(page);
    const threadsPanel = await ensureProjectChatThreadsPanelVisible(page);
    await expect(threadsPanel).toHaveAttribute("data-inline", "true");
    await expect
      .poll(
        async () =>
          await threadsPanel.getByTestId("project-chat-thread-entry").count(),
        { timeout: 20000 },
      )
      .toBeGreaterThanOrEqual(3);
    await expect(
      threadsPanel.getByTestId("project-chat-thread-working-indicator").first(),
    ).toHaveAttribute("data-unicode-spinner", "braille");
    await expect(
      threadsPanel.getByTestId("project-chat-thread-entry"),
    ).toHaveCount(3);

    await expect
      .poll(async () => {
        return await threadsPanel
          .getByTestId("project-chat-thread-entry")
          .evaluateAll((elements) => {
            return elements
              .map((element) => {
                const label = element.querySelector("span.truncate");
                return label?.textContent?.trim() ?? "";
              })
              .filter((label) => label.length > 0);
          });
      })
      .toEqual([
        "Existing thread new",
        "Existing thread middle",
        "Existing thread old",
      ]);
    const allConversationsSearchInput = overviewPane.getByTestId(
      "project-chat-master-search-input",
    );
    await allConversationsSearchInput.fill("backlog");
    await expect(
      threadsPanel
        .getByTestId("project-chat-thread-entry")
        .filter({ hasText: "Existing thread new" }),
    ).toHaveCount(1);
    await expect(
      threadsPanel
        .getByTestId("project-chat-thread-entry")
        .filter({ hasText: "Existing thread middle" }),
    ).toHaveCount(0);
    await expect(
      threadsPanel
        .getByTestId("project-chat-thread-entry")
        .filter({ hasText: "Existing thread old" }),
    ).toHaveCount(0);
    await allConversationsSearchInput.fill("");

    const existingThreadOldEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Existing thread old" });
    const existingThreadOldPinButton = existingThreadOldEntry.getByTestId(
      "project-chat-thread-pin-button",
    );
    await existingThreadOldPinButton.evaluate((element: HTMLElement) => {
      element.click();
    });
    await expect
      .poll(async () => {
        return await threadsPanel
          .getByTestId("project-chat-thread-entry")
          .evaluateAll((elements) => {
            return elements
              .map((element) => {
                const label = element.querySelector("span.truncate");
                return label?.textContent?.trim() ?? "";
              })
              .filter((label) => label.length > 0);
          });
      })
      .toEqual([
        "Existing thread old",
        "Existing thread new",
        "Existing thread middle",
      ]);
    await expect(
      threadsPanel.getByTestId("project-chat-thread-pinned-section-label"),
    ).toBeVisible();
    await expect(
      threadsPanel.getByTestId("project-chat-thread-unpinned-section-label"),
    ).toBeVisible();
    await expect(
      threadsPanel.getByTestId("project-chat-ungrouped-divider"),
    ).toHaveCount(0);
    await expect(
      threadsPanel.getByTestId("project-chat-ungrouped-label"),
    ).toHaveCount(0);
    await expect
      .poll(async () => {
        return await threadsPanel.evaluate((panel) => {
          const entries = panel.querySelector<HTMLElement>(
            '[data-testid="project-chat-ungrouped-entries"]',
          );
          if (!entries) {
            return null;
          }
          const styles = getComputedStyle(entries);
          return {
            borderLeftWidth: styles.borderLeftWidth,
            paddingLeft: styles.paddingLeft,
          };
        });
      })
      .toEqual({
        borderLeftWidth: "0px",
        paddingLeft: "4px",
      });

    await clickDom(overviewPane.getByRole("button", { name: "New Group" }));
    let groupNameInput = threadsPanel.getByTestId(
      "project-chat-thread-group-name-input",
    );
    await expect(groupNameInput).toBeVisible();
    await groupNameInput.fill("Backend");
    await groupNameInput.press("Enter");
    const backendGroupRow = threadsPanel
      .getByTestId("project-chat-thread-group-row")
      .filter({ hasText: "Backend" });
    await expect(backendGroupRow).toBeVisible();

    await clickDom(overviewPane.getByRole("button", { name: "New Group" }));
    groupNameInput = threadsPanel.getByTestId(
      "project-chat-thread-group-name-input",
    );
    await expect(groupNameInput).toBeVisible();
    await groupNameInput.fill("Frontend");
    await groupNameInput.press("Enter");
    const frontendGroupRow = threadsPanel
      .getByTestId("project-chat-thread-group-row")
      .filter({ hasText: "Frontend" });
    await expect(frontendGroupRow).toBeVisible();
    const ungroupedDivider = threadsPanel.getByTestId(
      "project-chat-ungrouped-divider",
    );
    const ungroupedLabel = threadsPanel.getByTestId(
      "project-chat-ungrouped-label",
    );
    await expect(ungroupedDivider).toBeVisible();
    await expect(ungroupedLabel).toBeVisible();
    await expect
      .poll(async () => {
        return await threadsPanel.evaluate((panel) => {
          const divider = panel.querySelector<HTMLElement>(
            '[data-testid="project-chat-ungrouped-divider"]',
          );
          const label = panel.querySelector<HTMLElement>(
            '[data-testid="project-chat-ungrouped-label"]',
          );
          if (!divider || !label) {
            return null;
          }
          const dividerStyles = getComputedStyle(divider);
          return {
            dividerBeforeLabel: divider.nextElementSibling === label,
            marginTop: dividerStyles.marginTop,
            marginBottom: dividerStyles.marginBottom,
          };
        });
      })
      .toEqual({
        dividerBeforeLabel: true,
        marginTop: "8px",
        marginBottom: "8px",
      });
    await expect
      .poll(async () => {
        return await backendGroupRow.evaluate((groupRow) => {
          const entries = groupRow.querySelector<HTMLElement>(
            '[data-testid="project-chat-thread-group-entries"]',
          );
          if (!entries) {
            return null;
          }
          const entriesStyles = getComputedStyle(entries);
          return {
            hasThreadEntries:
              groupRow.querySelector(
                '[data-testid="project-chat-thread-entry"] [role="button"]',
              ) !== null,
            paddingLeft: entriesStyles.paddingLeft,
          };
        });
      })
      .toEqual({
        hasThreadEntries: false,
        paddingLeft: "4px",
      });

    const existingThreadNewEntry = threadsPanel
      .getByTestId("project-chat-thread-entry")
      .filter({ hasText: "Existing thread new" })
      .first();
    await expect(existingThreadNewEntry).toBeVisible();
    await clickDom(existingThreadNewEntry);
    const conversationFilterInput = overviewPane.getByTestId(
      "project-chat-conversation-filter-input",
    );
    await expect(conversationFilterInput).toBeVisible();
    await expect(
      overviewPane.getByText("Existing queue thread reply"),
    ).toBeVisible();
    await conversationFilterInput.fill("missingtoken");
    await expect(
      overviewPane.getByText("No messages match this filter."),
    ).toBeVisible();
    await conversationFilterInput.fill("queue");
    await expect(
      overviewPane.getByText("Existing queue thread reply"),
    ).toBeVisible();
    await expect(
      overviewPane.getByTestId("project-chat-conversation-filter"),
    ).toContainText("1/2");
    const activeSearchMatch = overviewPane.locator(
      '[data-chat-search-active-match="true"]',
    );
    await expect(activeSearchMatch).toContainText(
      "Existing queue thread reply queue follow up",
    );
    await expect(
      activeSearchMatch.locator(
        'mark[data-chat-search-highlight="true"][data-chat-search-highlight-target="true"]',
      ),
    ).toContainText(/queue/i);
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
      .toBe(0);
    await conversationFilterInput.press("Enter");
    await expect(
      overviewPane.getByTestId("project-chat-conversation-filter"),
    ).toContainText("2/2");
    await expect(activeSearchMatch).toContainText(
      "Existing queue thread reply queue follow up",
    );
    await expect(
      activeSearchMatch.locator(
        'mark[data-chat-search-highlight="true"][data-chat-search-highlight-target="true"]',
      ),
    ).toContainText(/queue/i);
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
    await conversationFilterInput.fill("");
    await clickDom(overviewPane.locator('button[aria-label="New Chat"]'));
    const draftEntry = threadsPanel.getByTestId(
      "project-chat-thread-draft-entry",
    );
    await expect(draftEntry.first()).toBeVisible();
    await expect(draftEntry).toContainText("New thread...");
    await clickDom(existingThreadNewEntry);
    await expect(
      threadsPanel.getByTestId("project-chat-thread-draft-entry"),
    ).toHaveCount(0);

    const backendGroupDeleteButton = backendGroupRow.getByTestId(
      "project-chat-thread-group-delete-button",
    );
    await backendGroupDeleteButton.evaluate((element: HTMLElement) => {
      element.click();
    });
    await expect(
      threadsPanel
        .getByTestId("project-chat-thread-group-row")
        .filter({ hasText: "Backend" }),
    ).toHaveCount(0);
  } finally {
    await engineCleanup();
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat keeps conversation search on the top row at medium width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1480, height: 900 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 1100,
    overviewTrueWidth: 1100,
  });

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const overviewPane = await getOverviewProjectChatSurface(page);
    await expect(
      overviewPane.getByRole("button", { name: "New Chat" }),
    ).toBeVisible();
    await expect(
      overviewPane.getByRole("button", { name: "Project AI Settings" }),
    ).toBeVisible();
    await expect(
      overviewPane.getByTestId("project-chat-conversation-filter"),
    ).toBeVisible();

    const headerGeometry = await overviewPane.evaluate((paneElement) => {
      const newChatButton = paneElement.querySelector(
        'button[aria-label="New Chat"]',
      );
      const settingsButton = paneElement.querySelector(
        'button[aria-label="Project AI Settings"]',
      );
      const conversationFilter = paneElement.querySelector(
        '[data-testid="project-chat-conversation-filter"]',
      );
      if (!newChatButton || !settingsButton || !conversationFilter) {
        return null;
      }
      const newChatRect = newChatButton.getBoundingClientRect();
      const settingsRect = settingsButton.getBoundingClientRect();
      const filterRect = conversationFilter.getBoundingClientRect();
      return {
        newTop: newChatRect.top,
        settingsTop: settingsRect.top,
        filterTop: filterRect.top,
      };
    });

    expect(headerGeometry).not.toBeNull();
    if (!headerGeometry) {
      throw new Error(
        "Expected project chat header controls to be measurable.",
      );
    }
    expect(
      Math.abs(headerGeometry.newTop - headerGeometry.settingsTop),
    ).toBeLessThanOrEqual(3);
    expect(
      Math.abs(headerGeometry.filterTop - headerGeometry.settingsTop),
    ).toBeLessThanOrEqual(6);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("project ai chat keeps settings and conversation search visible when very narrow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 980, height: 900 });
  await seedLocalStorage(page, {
    overviewTab: "ProjectAIChat",
    overviewVis: true,
    overviewWidth: 240,
    overviewTrueWidth: 240,
  });

  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const overviewPane = await getOverviewProjectChatSurface(page);
    await expect(
      overviewPane.getByRole("button", { name: "New Chat" }),
    ).toBeVisible();
    await expect(
      overviewPane.getByRole("button", { name: "Project AI Settings" }),
    ).toBeVisible();
    await expect(
      overviewPane.getByTestId("project-chat-conversation-filter"),
    ).toBeVisible();

    const headerGeometry = await overviewPane.evaluate((paneElement) => {
      const newChatButton = paneElement.querySelector(
        'button[aria-label="New Chat"]',
      );
      const settingsButton = paneElement.querySelector(
        'button[aria-label="Project AI Settings"]',
      );
      const conversationFilter = paneElement.querySelector(
        '[data-testid="project-chat-conversation-filter"]',
      );
      if (!newChatButton || !settingsButton || !conversationFilter) {
        return null;
      }
      const newChatRect = newChatButton.getBoundingClientRect();
      const settingsRect = settingsButton.getBoundingClientRect();
      const filterRect = conversationFilter.getBoundingClientRect();
      return {
        newTop: newChatRect.top,
        settingsTop: settingsRect.top,
        filterTop: filterRect.top,
      };
    });

    expect(headerGeometry).not.toBeNull();
    if (!headerGeometry) {
      throw new Error(
        "Expected project chat header controls to be measurable.",
      );
    }
    expect(
      Math.abs(headerGeometry.newTop - headerGeometry.settingsTop),
    ).toBeLessThanOrEqual(3);
    expect(headerGeometry.filterTop).toBeGreaterThanOrEqual(
      headerGeometry.settingsTop,
    );
    expect(
      Math.abs(headerGeometry.filterTop - headerGeometry.settingsTop),
    ).toBeLessThanOrEqual(32);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
