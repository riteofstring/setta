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
      createProjectChatWindowInstance,
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
          "floating-window": createProjectChatWindowInstance({
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
          }),
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
      createProjectChatWindowInstance,
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
          "keep-window": createProjectChatWindowInstance({
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
          }),
          "stale-window": createProjectChatWindowInstance({
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
          }),
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

async function seedWindowSpacePaneWithSingleFloatingWindow(
  page: Page,
): Promise<void> {
  await page.evaluate(async () => {
    const { useLocalStorage, useProjectState, useShareSession } = await import(
      "/src/state/definitions.ts"
    );
    const {
      ChatWindowModeEnum,
      ChatWindowPlacementEnum,
      createProjectChatWindowInstance,
      createProjectChatWindowingState,
    } = await import("/src/utils/generatedTypes.ts");

    useLocalStorage.setState({
      overviewTab: "ViewModes",
      overviewVis: true,
    });
    useProjectState.setState((state) => {
      state.projectConfig.isEditingViewMode = true;
      state.projectConfig.windowSpaces = {};
      state.projectChatWindowing = createProjectChatWindowingState({
        order: ["save-window"],
        instancesById: {
          "save-window": createProjectChatWindowInstance({
            instanceId: "save-window",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            title: "Save Window",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 1,
            lastFocusedAt: 10,
            bounds: {
              x: 100,
              y: 120,
              width: 420,
              height: 320,
            },
          }),
        },
        nextInstanceNumber: 2,
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
      createProjectChatWindowInstance,
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
          "live-window": createProjectChatWindowInstance({
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
          }),
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

test("saving a window space keeps the latest floating window interaction while sync is delayed", async ({
  page,
}) => {
  await seedLocalStorage(page, { overviewTab: "Overview", overviewVis: true });
  const projectContext = await openIsolatedProject(page);
  let createRequestState: {
    windowsById: Record<string, unknown>;
    order: Array<string>;
  } | null = null;
  let releaseFirstSync: (() => void) | null = null;
  const firstSyncReleased = new Promise<void>((resolve) => {
    releaseFirstSync = resolve;
  });
  let syncRequestCount = 0;

  try {
    await seedWindowSpacePaneWithSingleFloatingWindow(page);

    await page.route("**/setProjectChatWindowingState", async (route) => {
      syncRequestCount += 1;
      const request = route.request().postDataJSON() as {
        state: {
          instancesById: Record<string, Record<string, unknown>>;
          order: Array<string>;
          nextInstanceNumber: number;
        };
      };
      if (syncRequestCount === 1) {
        await firstSyncReleased;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(request.state),
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
          id: "window-space-race",
          name: request.name,
          sortIndex: 0,
          windowsById: request.state.windowsById,
          order: request.state.order,
        }),
      });
    });

    const floatingWindow = page.locator(
      '[data-testid="project-chat-floating-window"][data-chat-window-instance-id="save-window"]',
    );
    await expect(floatingWindow).toBeVisible();

    await page.getByTestId("window-space-save-current-layout").click();
    await expect.poll(() => syncRequestCount).toBe(1);

    await page.evaluate(async () => {
      const { focusProjectChatWindow, setProjectChatWindowBounds } =
        await import("/src/state/actions/projectChatWindowing.ts");
      focusProjectChatWindow("save-window", 4242);
      setProjectChatWindowBounds("save-window", {
        x: 260,
        y: 180,
        width: 520,
        height: 360,
      });
    });
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const { useProjectState } = await import("/src/state/definitions.ts");
          const window =
            useProjectState.getState().projectChatWindowing.instancesById[
              "save-window"
            ];
          return {
            lastFocusedAt: window?.lastFocusedAt ?? null,
            bounds: window?.bounds ?? null,
          };
        }),
      )
      .toEqual({
        lastFocusedAt: 4242,
        bounds: {
          x: 260,
          y: 180,
          width: 520,
          height: 360,
        },
      });

    releaseFirstSync?.();

    await expect(page.getByTestId("window-space-edit-open")).toHaveCount(1);
    await expect.poll(() => syncRequestCount).toBeGreaterThan(1);

    const expectedSnapshot = await page.evaluate(async () => {
      const { useProjectState } = await import("/src/state/definitions.ts");
      const { snapshotFloatingWindowsForWindowSpace } = await import(
        "/src/state/actions/windowSpaces.ts"
      );
      const state = useProjectState.getState();
      return snapshotFloatingWindowsForWindowSpace({
        projectChatWindowing: state.projectChatWindowing,
        projectConfig: state.projectConfig,
        sections: state.sections,
        sectionImpls: state.sectionImpls,
        sectionVariants: state.sectionVariants,
      });
    });

    expect(createRequestState).toEqual(expectedSnapshot);
    const floatingWindowBox = await floatingWindow.boundingBox();
    expect(floatingWindowBox).not.toBeNull();
    expect(floatingWindowBox?.width ?? 0).toBeGreaterThan(500);
    expect(floatingWindowBox?.height ?? 0).toBeGreaterThan(350);
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
