import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  openIsolatedProject,
  seedLocalStorage,
} from "../../helpers";

async function seedWindowSpacePane(
  page: Page,
  { allowLayoutChanges }: { allowLayoutChanges: boolean },
): Promise<void> {
  await page.evaluate(async (nextAllowLayoutChanges) => {
    const { useLocalStorage, useProjectState, useShareSession } = await import(
      "/src/state/definitions.ts"
    );
    const {
      ChatWindowModeEnum,
      ChatWindowPlacementEnum,
      createProjectChatWindowingState,
      createWindowSpaceConfig,
    } = await import("/src/utils/generatedTypes.ts");

    useLocalStorage.setState({
      overviewTab: "ViewModes",
      overviewVis: true,
    });
    useProjectState.setState((state) => {
      state.projectConfig.isEditingViewMode = true;
      state.projectConfig.windowSpaces = {
        "window-space-a": createWindowSpaceConfig({
          id: "window-space-a",
          name: "Research Board",
          sortIndex: 0,
          windowsById: {},
          order: [],
        }),
        "window-space-b": createWindowSpaceConfig({
          id: "window-space-b",
          name: "Alpha Review",
          sortIndex: 1,
          windowsById: {},
          order: [],
        }),
      };
      state.projectChatWindowing = createProjectChatWindowingState({
        order: ["floating-window"],
        instancesById: {
          "floating-window": {
            instanceId: "floating-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            sectionIdOrNull: null,
            bounds: {
              x: 120,
              y: 80,
              width: 420,
              height: 320,
            },
          },
        },
      });
    });
    useShareSession.setState({
      isDeploymentMode: true,
      shareSessionId: "share-session-test",
      sessionRunCount: 0,
      sharePolicy: {
        allowLLM: true,
        allowParamChanges: false,
        allowVariantChanges: false,
        allowLayoutChanges: nextAllowLayoutChanges,
        allowRun: false,
        allowMultipleRuns: false,
      },
      shareDeploymentName: "deployment",
      shareDeploymentVersion: "v1",
    });
  }, allowLayoutChanges);

  await expect(page.getByTestId("window-spaces-pane")).toBeVisible();
}

async function seedWindowSpacePaneWithTwoFloatingWindows(
  page: Page,
): Promise<void> {
  await page.evaluate(async () => {
    const { useLocalStorage, useProjectState, useShareSession } = await import(
      "/src/state/definitions.ts"
    );
    const {
      ChatWindowModeEnum,
      ChatWindowPlacementEnum,
      createProjectChatWindowingState,
      createWindowSpaceConfig,
    } = await import("/src/utils/generatedTypes.ts");

    useLocalStorage.setState({
      overviewTab: "ViewModes",
      overviewVis: true,
    });
    useProjectState.setState((state) => {
      state.projectConfig.isEditingViewMode = true;
      state.projectConfig.windowSpaces = {
        "window-space-a": createWindowSpaceConfig({
          id: "window-space-a",
          name: "Research Board",
          sortIndex: 0,
          windowsById: {},
          order: [],
        }),
      };
      state.projectChatWindowing = createProjectChatWindowingState({
        order: ["keep-window", "stale-window"],
        instancesById: {
          "keep-window": {
            instanceId: "keep-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Keep Window",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            bounds: {
              x: 120,
              y: 80,
              width: 420,
              height: 320,
            },
          },
          "stale-window": {
            instanceId: "stale-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Stale Window",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            bounds: {
              x: 560,
              y: 110,
              width: 360,
              height: 280,
            },
          },
        },
      });
    });
    useShareSession.setState({
      isDeploymentMode: true,
      shareSessionId: "share-session-test",
      sessionRunCount: 0,
      sharePolicy: {
        allowLLM: true,
        allowParamChanges: false,
        allowVariantChanges: false,
        allowLayoutChanges: true,
        allowRun: false,
        allowMultipleRuns: false,
      },
      shareDeploymentName: "deployment",
      shareDeploymentVersion: "v1",
    });
  });

  await expect(page.getByTestId("window-spaces-pane")).toBeVisible();
}

async function seedWindowSpacePaneWithBlockedThreadRestore(
  page: Page,
): Promise<void> {
  await page.evaluate(async () => {
    const { useLocalStorage, useProjectState, useShareSession } = await import(
      "/src/state/definitions.ts"
    );
    const {
      ChatWindowModeEnum,
      ChatWindowPlacementEnum,
      createProjectChatWindowingState,
      createWindowSpaceConfig,
    } = await import("/src/utils/generatedTypes.ts");

    useLocalStorage.setState({
      overviewTab: "ViewModes",
      overviewVis: true,
    });
    useProjectState.setState((state) => {
      state.projectConfig.isEditingViewMode = true;
      state.projectConfig.windowSpaces = {
        "window-space-a": createWindowSpaceConfig({
          id: "window-space-a",
          name: "Research Board",
          sortIndex: 0,
          windowsById: {
            "saved-window": {
              surfaceKind: "project_chat",
              mode: ChatWindowModeEnum.project_ai_mode,
              title: "Saved Chat",
              chatId: "chat-restored",
              zIndex: 2,
              normalizedBounds: {
                x: 0.1,
                y: 0.1,
                width: 0.45,
                height: 0.5,
              },
            },
          },
          order: ["saved-window"],
        }),
      };
      state.projectChatWindowing = createProjectChatWindowingState({
        order: ["live-window"],
        instancesById: {
          "live-window": {
            instanceId: "live-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Live Chat",
            chatId: "chat-live",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            sectionIdOrNull: null,
            bounds: {
              x: 120,
              y: 80,
              width: 420,
              height: 320,
            },
          },
        },
        nextInstanceNumber: 2,
      });
    });
    useShareSession.setState({
      isDeploymentMode: true,
      shareSessionId: "share-session-test",
      sessionRunCount: 0,
      sharePolicy: {
        allowLLM: false,
        allowParamChanges: false,
        allowVariantChanges: false,
        allowLayoutChanges: true,
        allowRun: false,
        allowMultipleRuns: false,
      },
      shareDeploymentName: "deployment",
      shareDeploymentVersion: "v1",
    });
  });

  await expect(page.getByTestId("window-spaces-pane")).toBeVisible();
}

test("window-space controls stay available when deployment mode allows layout edits", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "Overview", overviewVis: true });
  const projectContext = await openIsolatedProject(page);

  try {
    await seedWindowSpacePane(page, { allowLayoutChanges: true });

    await expect(
      page.getByTestId("window-space-save-current-layout"),
    ).toBeEnabled();
    await expect(
      page.getByTestId("window-space-edit-open").first(),
    ).toBeEnabled();
    await expect(page.getByTestId("window-space-delete").first()).toBeVisible();
    await expect(page.getByTestId("window-space-drag-handle")).toHaveCount(2);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("window-space controls disable when deployment mode blocks layout edits", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "Overview", overviewVis: true });
  const projectContext = await openIsolatedProject(page);

  try {
    await seedWindowSpacePane(page, { allowLayoutChanges: false });

    await expect(
      page.getByTestId("window-space-save-current-layout"),
    ).toBeDisabled();
    await expect(page.getByTestId("window-space-open").first()).toBeDisabled();
    await expect(page.getByTestId("window-space-delete")).toHaveCount(0);
    await expect(page.getByTestId("window-space-drag-handle")).toHaveCount(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("saving a window space reconciles the live workspace to the backend-normalized layout", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "Overview", overviewVis: true });
  const projectContext = await openIsolatedProject(page);
  let createRequestState: {
    windowsById: Record<string, unknown>;
    order: Array<string>;
  } | null = null;

  try {
    await seedWindowSpacePaneWithTwoFloatingWindows(page);

    await page.route("**/setProjectChatWindowingState", async (route) => {
      const request = route.request().postDataJSON() as {
        state: {
          instancesById: Record<string, Record<string, unknown>>;
          order: Array<string>;
          nextInstanceNumber: number;
        };
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          instancesById: {
            "keep-window": request.state.instancesById["keep-window"],
          },
          order: ["keep-window"],
          nextInstanceNumber: request.state.nextInstanceNumber,
        }),
      });
    });
    await page.route("**/createWindowSpace", async (route) => {
      const request = route.request().postDataJSON() as {
        state: {
          windowsById: Record<string, unknown>;
          order: Array<string>;
        };
        name: string;
      };
      createRequestState = request.state;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "window-space-c",
          name: request.name,
          sortIndex: 1,
          windowsById: request.state.windowsById,
          order: request.state.order,
        }),
      });
    });

    await expect(
      page.locator(
        '[data-testid="project-chat-floating-window"][data-chat-window-instance-id="stale-window"]',
      ),
    ).toBeVisible();

    await page.getByTestId("window-space-save-current-layout").click();

    await expect(
      page.locator(
        '[data-testid="project-chat-floating-window"][data-chat-window-instance-id="keep-window"]',
      ),
    ).toBeVisible();
    await expect(
      page.locator(
        '[data-testid="project-chat-floating-window"][data-chat-window-instance-id="stale-window"]',
      ),
    ).toHaveCount(0);
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const { useProjectState } = await import("/src/state/definitions.ts");
          return useProjectState.getState().projectChatWindowing.order;
        }),
      )
      .toEqual(["keep-window"]);
    expect(createRequestState?.order).toEqual(["keep-window"]);
    expect(Object.keys(createRequestState?.windowsById ?? {})).toEqual([
      "keep-window",
    ]);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("restore stays blocked when deployment policy disallows saved thread rebinding", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "Overview", overviewVis: true });
  const projectContext = await openIsolatedProject(page);
  let layoutWriteCount = 0;
  let threadBindingWriteCount = 0;

  try {
    await seedWindowSpacePaneWithBlockedThreadRestore(page);

    await page.route("**/setProjectChatWindowingState", async (route) => {
      layoutWriteCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(route.request().postDataJSON()?.state ?? {}),
      });
    });
    await page.route("**/setProjectChatWindowChatId", async (route) => {
      threadBindingWriteCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await expect(page.getByTestId("window-space-edit-open")).toBeVisible();

    await page.getByTestId("window-space-edit-open").click();

    await expect(
      page.locator(
        '[data-testid="project-chat-floating-window"][data-chat-window-instance-id="saved-window"]',
      ),
    ).toHaveCount(0);
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const { useProjectState } = await import("/src/state/definitions.ts");
          return useProjectState.getState().projectChatWindowing.order;
        }),
      )
      .toEqual(["live-window"]);
    expect(layoutWriteCount).toBe(0);
    expect(threadBindingWriteCount).toBe(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
