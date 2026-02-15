import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
  loadProjectConfig,
} from "../helpers";

const READY_SELECTOR = ".react-flow__pane";
const VIEW_MODE_TABS_SELECTOR = '[data-testid="view-mode-tabs-bar"]';
const IS_DARWIN = process.platform === "darwin";
let warnedAboutCrossPlatformScreenshots = false;

type LoadProjectConfigWithViewModes = {
  projectConfig?: {
    viewModes?: Record<string, { isTab?: boolean }>;
  };
};

async function waitForReady(page: Page) {
  await page.waitForSelector(READY_SELECTOR);
}

async function expectMacOnlyScreenshot(locator: Locator, name: string) {
  if (!IS_DARWIN) {
    if (!warnedAboutCrossPlatformScreenshots) {
      warnedAboutCrossPlatformScreenshots = true;
      console.warn(
        "[view-mode-tabs-bottom-bar] Screenshot assertions are currently macOS-only. This still needs cross-platform baselines.",
      );
    }
    return;
  }
  await expect(locator).toHaveScreenshot(name, {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.02,
  });
}

async function ensureNoTabbedViewModes(page: Page, projectConfigId: string) {
  const payload = (await loadProjectConfig(page)) as LoadProjectConfigWithViewModes;
  const viewModes = payload.projectConfig?.viewModes ?? {};
  for (const [viewModeId, mode] of Object.entries(viewModes)) {
    if (mode?.isTab) {
      await postBackend(page, "/toggleViewModeTab", {
        projectConfigId,
        viewModeId,
      });
    }
  }
}

async function forceIdeSessionState(page: Page) {
  await page.evaluate(async () => {
    window.sessionStorage.removeItem("settaShareSession");
    window.sessionStorage.removeItem("settaAppSession");
    const { useShareSession, useServerMode } = await import(
      "/src/state/definitions.ts"
    );
    useShareSession.setState({
      isDeploymentMode: false,
      shareSessionId: null,
      sessionRunCount: 0,
      sharePolicy: null,
      shareDeploymentName: null,
      shareDeploymentVersion: null,
      deploymentMode: null,
    });
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
  });
}

async function createTabbedViewMode(
  page: Page,
  projectConfigId: string,
  name: string,
): Promise<string> {
  const viewModeId = await postBackend<string>(page, "/createViewMode", {
    projectConfigId,
  });
  if (!viewModeId) {
    throw new Error("Missing viewModeId when creating view mode.");
  }
  await postBackend(page, "/setViewModeName", {
    projectConfigId,
    viewModeId,
    name,
  });
  await postBackend(page, "/toggleViewModeTab", {
    projectConfigId,
    viewModeId,
  });
  return viewModeId;
}

test.describe("view mode bottom tab bar layout", () => {
  test("when no tabs exist, icon rails extend to the bottom (no reserved gap)", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      colorMode: "dark",
      darkMode: true,
      showMinimap: true,
      overviewVis: true,
      overviewTab: "Overview",
      uiEditorVis: false,
    });

    const { projectConfigId } = await openIsolatedProject(page);

    try {
      await forceIdeSessionState(page);
      await ensureNoTabbedViewModes(page, projectConfigId);
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForReady(page);

      await expect(page.locator(VIEW_MODE_TABS_SELECTOR)).toHaveCount(0);

      const overviewRail = page.getByTestId("overview-icon-rail");
      await expect(overviewRail).toBeVisible();
      const uiEditorRail = page.getByTestId("ui-editor-icon-rail");
      await expect(uiEditorRail).toBeVisible();

      const viewport = page.viewportSize();
      if (!viewport) {
        throw new Error("Missing viewport size.");
      }
      const railBox = await overviewRail.boundingBox();
      const uiEditorRailBox = await uiEditorRail.boundingBox();
      if (!railBox) {
        throw new Error("Missing Overview rail bounding box.");
      }
      if (!uiEditorRailBox) {
        throw new Error("Missing UiEditor rail bounding box.");
      }
      expect(railBox.y + railBox.height).toBeGreaterThanOrEqual(
        viewport.height - 2,
      );
      expect(uiEditorRailBox.y + uiEditorRailBox.height).toBeGreaterThanOrEqual(
        viewport.height - 2,
      );

      const shareSessionState = await page.evaluate(async () => {
        const { useShareSession } = await import("/src/state/definitions.ts");
        const state = useShareSession.getState();
        return {
          isDeploymentMode: state.isDeploymentMode,
          deploymentMode: state.deploymentMode,
          shareSessionId: state.shareSessionId,
        };
      });
      expect(shareSessionState.isDeploymentMode).toBe(false);

      await expectMacOnlyScreenshot(overviewRail, "overview-rail-no-tabs.png");
    } finally {
      await postBackend(page, "/deleteProjectConfigs", {
        ids: [projectConfigId],
      });
    }
  });

  test("when tabs exist, bottom bar is visible and does not occlude the minimap", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      colorMode: "dark",
      darkMode: true,
      showMinimap: true,
      overviewVis: true,
      overviewTab: "Overview",
      uiEditorVis: false,
    });

    const { projectConfigId } = await openIsolatedProject(page);

    try {
      await forceIdeSessionState(page);
      await ensureNoTabbedViewModes(page, projectConfigId);
      const tabAId = await createTabbedViewMode(page, projectConfigId, "Tab A");
      const tabBId = await createTabbedViewMode(page, projectConfigId, "Tab B");

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForReady(page);

      const tabsBar = page.locator(VIEW_MODE_TABS_SELECTOR);
      await expect(tabsBar).toBeVisible();
      const tabA = tabsBar.locator(
        `[data-testid="view-mode-tab-button"][data-view-mode-id="${tabAId}"]`,
      );
      await expect(tabA).toBeVisible();
      const tabB = tabsBar.locator(
        `[data-testid="view-mode-tab-button"][data-view-mode-id="${tabBId}"]`,
      );
      await expect(tabB).toBeVisible();

      await expect(tabA).toHaveAttribute("title", "Tab A");
      await expect(tabB).toHaveAttribute("title", "Tab B");
      await expect(tabA.locator("span.truncate")).toHaveText("Tab A");
      await expect(tabB.locator("span.truncate")).toHaveText("Tab B");

      const tabStyles = await tabA.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          boxSizing: style.boxSizing,
          borderTopStyle: style.borderTopStyle,
          borderTopWidth: style.borderTopWidth,
          borderTopColor: style.borderTopColor,
          backgroundColor: style.backgroundColor,
        };
      });
      expect(tabStyles.boxSizing).toBe("border-box");
      expect(tabStyles.borderTopStyle).toBe("solid");
      expect(tabStyles.borderTopWidth).toBe("1px");
      expect(tabStyles.borderTopColor).not.toBe(tabStyles.backgroundColor);

      const overviewRail = page.getByTestId("overview-icon-rail");
      await expect(overviewRail).toBeVisible();
      const uiEditorRail = page.getByTestId("ui-editor-icon-rail");
      await expect(uiEditorRail).toBeVisible();
      const barBox = await tabsBar.boundingBox();
      const railBox = await overviewRail.boundingBox();
      const uiEditorRailBox = await uiEditorRail.boundingBox();
      if (!barBox || !railBox) {
        throw new Error("Missing bounding boxes for layout assertions.");
      }
      expect(railBox.y + railBox.height).toBeLessThanOrEqual(barBox.y + 1);
      if (!uiEditorRailBox) {
        throw new Error("Missing UiEditor rail bounding box.");
      }
      expect(uiEditorRailBox.y + uiEditorRailBox.height).toBeLessThanOrEqual(
        barBox.y + 1,
      );

      const minimap = page.locator('[data-testid="rf__minimap"]');
      await expect(minimap).toBeVisible();
      const minimapBox = await minimap.boundingBox();
      if (!minimapBox) {
        throw new Error("Missing minimap bounding box.");
      }
      expect(minimapBox.y + minimapBox.height).toBeLessThanOrEqual(barBox.y - 2);

      // These are the smallest, most stable screenshots and are meant to catch
      // regressions like losing the visible tab outline.
      await expectMacOnlyScreenshot(tabA, "view-mode-tab-a-dark.png");
      await expectMacOnlyScreenshot(tabB, "view-mode-tab-b-dark.png");
      await expectMacOnlyScreenshot(tabsBar, "view-mode-tabs-bar-dark.png");
    } finally {
      await postBackend(page, "/deleteProjectConfigs", {
        ids: [projectConfigId],
      });
    }
  });

  test("in light mode, bottom tab bar matches top-nav white background", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      colorMode: "light",
      darkMode: false,
      showMinimap: true,
      overviewVis: true,
      overviewTab: "Overview",
      uiEditorVis: false,
    });

    const { projectConfigId } = await openIsolatedProject(page);

    try {
      await forceIdeSessionState(page);
      await ensureNoTabbedViewModes(page, projectConfigId);
      const tabAId = await createTabbedViewMode(page, projectConfigId, "Tab A");
      const tabBId = await createTabbedViewMode(page, projectConfigId, "Tab B");

      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForReady(page);

      const tabsBar = page.locator(VIEW_MODE_TABS_SELECTOR);
      await expect(tabsBar).toBeVisible();
      const tabA = tabsBar.locator(
        `[data-testid="view-mode-tab-button"][data-view-mode-id="${tabAId}"]`,
      );
      await expect(tabA).toBeVisible();
      const tabB = tabsBar.locator(
        `[data-testid="view-mode-tab-button"][data-view-mode-id="${tabBId}"]`,
      );
      await expect(tabB).toBeVisible();
      await expect(tabA).toHaveAttribute("title", "Tab A");
      await expect(tabB).toHaveAttribute("title", "Tab B");
      await expect(tabA.locator("span.truncate")).toHaveText("Tab A");
      await expect(tabB.locator("span.truncate")).toHaveText("Tab B");

      const barStyles = await tabsBar.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          backgroundColor: style.backgroundColor,
          borderTopColor: style.borderTopColor,
        };
      });
      expect(barStyles.backgroundColor).toBe("rgb(255, 255, 255)");
      expect(barStyles.borderTopColor).not.toBe(barStyles.backgroundColor);

      const tabBackgroundColors = await Promise.all(
        [tabA, tabB].map((tab) =>
          tab.evaluate((el) => getComputedStyle(el).backgroundColor),
        ),
      );
      expect(
        tabBackgroundColors.some((color) => color !== "rgb(255, 255, 255)"),
      ).toBeTruthy();

      await expectMacOnlyScreenshot(tabsBar, "view-mode-tabs-bar-light.png");
    } finally {
      await postBackend(page, "/deleteProjectConfigs", {
        ids: [projectConfigId],
      });
    }
  });
});
