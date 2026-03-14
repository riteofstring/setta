import { expect, test, type Page } from "@playwright/test";
import { cleanupIsolatedProject, openIsolatedProject } from "../../helpers";

async function seedReadOnlyProjectChatLayout(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { useLocalStorage, useProjectState, useShareSession } = await import(
      "/src/state/definitions.ts"
    );
    const { createProjectChatWindowingState } = await import(
      "/src/utils/generatedTypes.ts"
    );

    useLocalStorage.setState({
      overviewTab: "ProjectAIChat",
      overviewVis: true,
    });
    useProjectState.setState((state) => {
      state.projectChatWindowing = createProjectChatWindowingState();
    });
    useShareSession.setState({
      isDeploymentMode: true,
      shareSessionId: "share-session-test",
      sessionRunCount: 0,
      sharePolicy: {
        allowLLM: true,
        allowLayoutChanges: false,
        allowParamChanges: false,
        allowVariantChanges: false,
        allowRun: false,
        allowMultipleRuns: false,
      },
      shareDeploymentName: "deployment",
      shareDeploymentVersion: "v1",
      deploymentMode: "share",
    });
  });
}

async function seedReadOnlyVisibleProjectChatWindows(
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
    } = await import("/src/utils/generatedTypes.ts");

    useLocalStorage.setState({
      overviewTab: "ProjectAIChat",
      overviewVis: true,
    });
    useProjectState.setState((state) => {
      state.projectChatWindowing = createProjectChatWindowingState({
        order: ["project-chat-window-1", "project-chat-window-2"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            chatId: "chat-a",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 1,
            bounds: {
              x: 120,
              y: 80,
              width: 420,
              height: 320,
            },
          },
          "project-chat-window-2": {
            instanceId: "project-chat-window-2",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            chatId: "chat-b",
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            zIndex: 2,
            bounds: {
              x: 260,
              y: 140,
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
        allowLayoutChanges: false,
        allowParamChanges: false,
        allowVariantChanges: false,
        allowRun: false,
        allowMultipleRuns: false,
      },
      shareDeploymentName: "deployment",
      shareDeploymentVersion: "v1",
      deploymentMode: "share",
    });
  });
}

async function seedReadOnlyHiddenProjectChatWindow(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { useLocalStorage, useProjectState, useShareSession } = await import(
      "/src/state/definitions.ts"
    );
    const {
      ChatWindowModeEnum,
      ChatWindowPlacementEnum,
      createProjectChatWindowingState,
    } = await import("/src/utils/generatedTypes.ts");

    useLocalStorage.setState({
      overviewTab: "ProjectAIChat",
      overviewVis: true,
    });
    useProjectState.setState((state) => {
      state.projectChatWindowing = createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        instancesById: {
          "project-chat-window-1": {
            instanceId: "project-chat-window-1",
            placement: ChatWindowPlacementEnum.floating,
            mode: ChatWindowModeEnum.project_ai_mode,
            chatId: "chat-a",
            isClosed: false,
            isMinimized: true,
            isMaximized: false,
            zIndex: 1,
            bounds: {
              x: 160,
              y: 120,
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
        allowLayoutChanges: false,
        allowParamChanges: false,
        allowVariantChanges: false,
        allowRun: false,
        allowMultipleRuns: false,
      },
      shareDeploymentName: "deployment",
      shareDeploymentVersion: "v1",
      deploymentMode: "share",
    });
  });
}

test("read-only deployments do not auto-create project chat windows or expose layout controls", async ({
  page,
}) => {
  const projectContext = await openIsolatedProject(page);

  try {
    await seedReadOnlyProjectChatLayout(page);

    await expect(page.getByTestId("project-chat-window-surface")).toHaveCount(
      0,
    );
    await expect(
      page.getByTestId("project-chat-bottom-dock-create"),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /new chat/i })).toHaveCount(
      0,
    );
    await expect(
      page.evaluate(async () => {
        const { useProjectState } = await import("/src/state/definitions.ts");
        return useProjectState.getState().projectChatWindowing.order.length;
      }),
    ).resolves.toBe(0);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("read-only deployments keep visible project chat windows focusable without layout controls", async ({
  page,
}) => {
  const projectContext = await openIsolatedProject(page);
  let layoutWriteCalls = 0;
  let chatIdWriteCalls = 0;

  try {
    await seedReadOnlyVisibleProjectChatWindows(page);
    await page.route("**/setProjectChatWindowingState", async (route) => {
      layoutWriteCalls += 1;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "Deployment policy disallows layout changes.",
        }),
      });
    });
    await page.route("**/setProjectChatWindowChatId", async (route) => {
      chatIdWriteCalls += 1;
      const request = route.request().postDataJSON() as {
        instanceId: string;
        chatId: string | null;
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          order: ["project-chat-window-1", "project-chat-window-2"],
          instancesById: {
            "project-chat-window-1": {
              instanceId: "project-chat-window-1",
              placement: "floating",
              mode: "project_ai_mode",
              chatId:
                request.instanceId === "project-chat-window-1"
                  ? request.chatId
                  : "chat-a",
              isClosed: false,
              isMinimized: false,
              isMaximized: false,
              zIndex: 1,
              bounds: {
                x: 120,
                y: 80,
                width: 420,
                height: 320,
              },
            },
            "project-chat-window-2": {
              instanceId: "project-chat-window-2",
              placement: "floating",
              mode: "project_ai_mode",
              chatId:
                request.instanceId === "project-chat-window-2"
                  ? request.chatId
                  : "chat-b",
              isClosed: false,
              isMinimized: false,
              isMaximized: false,
              zIndex: 2,
              bounds: {
                x: 260,
                y: 140,
                width: 420,
                height: 320,
              },
            },
          },
        }),
      });
    });

    const backgroundWindow = page.locator(
      '[data-testid="project-chat-floating-window"][data-chat-window-instance-id="project-chat-window-1"]',
    );
    const frontWindow = page.locator(
      '[data-testid="project-chat-floating-window"][data-chat-window-instance-id="project-chat-window-2"]',
    );

    await expect(backgroundWindow).toBeVisible();
    await expect(frontWindow).toBeVisible();
    await expect(page.getByTestId("project-chat-window-maximize")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("project-chat-window-minimize")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("project-chat-window-close")).toHaveCount(0);
    await expect(page.getByTestId("project-chat-window-dock")).toHaveCount(0);
    await expect(
      page.getByTestId("project-chat-window-show-in-canvas"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("project-chat-floating-window-resize-handle"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("project-chat-floating-window-drag-handle"),
    ).toHaveCount(0);

    await frontWindow
      .locator('[data-project-chat-window-title="true"]')
      .first()
      .dblclick();
    await expect(
      page.getByTestId("project-chat-window-title-input"),
    ).toHaveCount(0);

    await backgroundWindow.dispatchEvent("pointerdown");

    // Read-only mode should still allow local z-order updates for already-visible windows.
    await expect
      .poll(async () => {
        return await page.evaluate(async () => {
          const { useProjectState } = await import("/src/state/definitions.ts");
          const windowing = useProjectState.getState().projectChatWindowing;
          const first =
            windowing.instancesById["project-chat-window-1"]?.zIndex ?? 0;
          const second =
            windowing.instancesById["project-chat-window-2"]?.zIndex ?? 0;
          return first > second;
        });
      })
      .toBe(true);

    await page.evaluate(async () => {
      const { setProjectChatWindowChatId } = await import(
        "/src/state/actions/projectChatWindowing.ts"
      );
      setProjectChatWindowChatId("project-chat-window-1", "chat-after");
    });

    await expect
      .poll(async () => {
        return await page.evaluate(async () => {
          const { useProjectState } = await import("/src/state/definitions.ts");
          return (
            useProjectState.getState().projectChatWindowing.instancesById[
              "project-chat-window-1"
            ]?.chatId ?? null
          );
        });
      })
      .toBe("chat-after");
    expect(chatIdWriteCalls).toBe(1);
    expect(layoutWriteCalls).toBe(0);
  } finally {
    await page.unroute("**/setProjectChatWindowingState").catch(() => null);
    await page.unroute("**/setProjectChatWindowChatId").catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("read-only deployments can reopen hidden project chat windows without layout writes", async ({
  page,
}) => {
  const projectContext = await openIsolatedProject(page);
  let layoutWriteCalls = 0;

  try {
    await seedReadOnlyHiddenProjectChatWindow(page);
    await page.route("**/setProjectChatWindowingState", async (route) => {
      layoutWriteCalls += 1;
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          detail: "Deployment policy disallows layout changes.",
        }),
      });
    });

    const floatingWindow = page.locator(
      '[data-testid="project-chat-floating-window"][data-chat-window-instance-id="project-chat-window-1"]',
    );
    await expect(floatingWindow).toHaveCount(0);
    await expect(
      page.getByTestId("project-chat-manager-reopen"),
    ).toHaveAttribute("data-chat-window-instance-id", "project-chat-window-1");
    await expect(
      page.getByTestId("project-chat-manager-focus"),
    ).toHaveAttribute("data-chat-window-instance-id", "project-chat-window-1");
    await expect(page.getByTestId("project-chat-manager-hide")).toHaveCount(0);
    await expect(
      page.getByTestId("project-chat-window-move-to-canvas"),
    ).toHaveCount(0);

    await page.getByTestId("project-chat-manager-reopen").click();

    await expect(floatingWindow).toBeVisible();
    await expect
      .poll(async () => {
        return await page.evaluate(async () => {
          const { useProjectState } = await import("/src/state/definitions.ts");
          const window =
            useProjectState.getState().projectChatWindowing.instancesById[
              "project-chat-window-1"
            ];
          return {
            isClosed: window?.isClosed ?? true,
            isMinimized: window?.isMinimized ?? true,
          };
        });
      })
      .toEqual({
        isClosed: false,
        isMinimized: false,
      });
    expect(layoutWriteCalls).toBe(0);
  } finally {
    await page.unroute("**/setProjectChatWindowingState").catch(() => null);
    await cleanupIsolatedProject(page, projectContext);
  }
});
