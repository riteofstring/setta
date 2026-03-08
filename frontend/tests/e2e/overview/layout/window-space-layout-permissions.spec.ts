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
