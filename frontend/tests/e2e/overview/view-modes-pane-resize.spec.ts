import { expect, test, type Page } from "@playwright/test";
import {
  ensureAppReady,
  loadProjectConfig,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
  setOverviewTab,
} from "../helpers";

type LoadProjectConfigWithViewModes = {
  projectConfig?: {
    viewModes?: Record<string, { isTab?: boolean }>;
  };
};
const READY_SELECTOR = ".react-flow__pane";

async function waitForReady(page: Page): Promise<void> {
  await page.waitForSelector(READY_SELECTOR);
}

async function ensureNoTabbedViewModes(
  page: Page,
  projectConfigId: string,
): Promise<void> {
  const payload = (await loadProjectConfig(page)) as LoadProjectConfigWithViewModes;
  const viewModes = payload.projectConfig?.viewModes ?? {};
  for (const [viewModeId, mode] of Object.entries(viewModes)) {
    if (!mode?.isTab) {
      continue;
    }
    await postBackend(page, "/toggleViewModeTab", {
      projectConfigId,
      viewModeId,
    });
  }
}

async function ensureOneTabbedViewMode(
  page: Page,
  projectConfigId: string,
): Promise<void> {
  const payload = (await loadProjectConfig(page)) as LoadProjectConfigWithViewModes;
  const viewModes = payload.projectConfig?.viewModes ?? {};
  const targetEntry =
    Object.entries(viewModes).find(([, mode]) => !mode?.isTab) ??
    Object.entries(viewModes)[0];
  if (!targetEntry) {
    throw new Error("No view modes available.");
  }
  const [viewModeId, mode] = targetEntry;
  if (mode?.isTab) {
    return;
  }
  await postBackend(page, "/toggleViewModeTab", {
    projectConfigId,
    viewModeId,
  });
}

test.describe.serial("view modes bottom preview panel", () => {
  test("supports disabled, collapse, and resize behavior in the overview pane", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewVis: true,
      overviewTab: "ViewModes",
    });
    await ensureAppReady(page);

    const projectContext = await openIsolatedProject(page);
    await ensureNoTabbedViewModes(page, projectContext.projectConfigId);
    await setOverviewTab(page, "ViewModes");
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForReady(page);

    const pane = page.getByTestId("view-modes-pane");
    await expect(pane).toBeVisible();
    const panel = page.getByTestId("view-modes-tabs-panel");
    await expect(panel).toBeVisible();
    const panelToggle = page.getByTestId("view-modes-tabs-panel-toggle");
    await expect(panelToggle).toBeDisabled();
    await expect(page.getByTestId("view-modes-tabs-resize-handle")).toHaveCount(
      0,
    );

    await ensureOneTabbedViewMode(page, projectContext.projectConfigId);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForReady(page);
    await expect(panelToggle).toBeEnabled();
    await expect(page.getByTestId("view-modes-tabs-resize-handle")).toHaveCount(
      1,
    );

    const panelHeightBeforeResize = await panel.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    await page.evaluate(() => {
      const handle = document.querySelector(
        '[data-testid="view-modes-tabs-resize-handle"]',
      );
      if (!(handle instanceof HTMLElement)) {
        throw new Error("Missing view-modes tabs resize handle.");
      }
      const rect = handle.getBoundingClientRect();
      const startX = rect.left + rect.width / 2;
      const startY = rect.top + rect.height / 2;
      handle.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          clientX: startX,
          clientY: startY,
          button: 0,
        }),
      );
      window.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientX: startX,
          clientY: startY - 56,
          buttons: 1,
        }),
      );
      window.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          clientX: startX,
          clientY: startY - 56,
          button: 0,
        }),
      );
    });
    const panelHeightAfterResize = await panel.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    expect(panelHeightAfterResize).toBeGreaterThan(panelHeightBeforeResize + 20);

    await panelToggle.click();
    await expect(page.getByTestId("view-modes-tabs-resize-handle")).toHaveCount(
      0,
    );
    const panelHeightAfterCollapse = await panel.evaluate(
      (element) => element.getBoundingClientRect().height,
    );
    expect(panelHeightAfterCollapse).toBeLessThan(panelHeightAfterResize - 20);
  });
});
