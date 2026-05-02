import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  loadProjectConfig,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
  setOverviewTab,
} from "../../helpers";

type LoadProjectConfigWithViewModes = {
  projectConfig?: {
    activeViewModeId?: string | null;
    viewModes?: Record<string, { isTab?: boolean }>;
  };
};
const READY_SELECTOR = ".setta-gpu-flow__pane";
const NARROW_OVERVIEW_WIDTH = 250;
const WIDE_OVERVIEW_WIDTH = 520;

async function waitForReady(page: Page): Promise<void> {
  await page.waitForSelector(READY_SELECTOR);
}

async function ensureAtLeastTwoViewModes(
  page: Page,
  projectConfigId: string,
): Promise<void> {
  const payload = (await loadProjectConfig(
    page,
  )) as LoadProjectConfigWithViewModes;
  const modeCount = Object.keys(payload.projectConfig?.viewModes ?? {}).length;
  if (modeCount >= 2) {
    return;
  }
  await postBackend(page, "/createViewMode", {
    projectConfigId,
  });
}

async function ensureOneTabbedViewMode(
  page: Page,
  projectConfigId: string,
): Promise<void> {
  const payload = (await loadProjectConfig(
    page,
  )) as LoadProjectConfigWithViewModes;
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

async function setOverviewWidth(page: Page, width: number): Promise<void> {
  await page.evaluate((nextWidth) => {
    const key = "setta_data";
    const raw = localStorage.getItem(key);
    let payload: { state: Record<string, unknown>; version: number } = {
      state: {},
      version: 0,
    };
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          state?: Record<string, unknown>;
          version?: number;
        };
        payload = {
          state:
            parsed && typeof parsed.state === "object" && parsed.state
              ? parsed.state
              : {},
          version: typeof parsed?.version === "number" ? parsed.version : 0,
        };
      } catch {
        payload = { state: {}, version: 0 };
      }
    }

    payload.state = {
      ...payload.state,
      overviewVis: true,
      overviewTab: "ViewModes",
      overviewWidth: nextWidth,
      overviewTrueWidth: nextWidth,
    };
    localStorage.setItem(key, JSON.stringify(payload));
  }, width);
}

async function assertNoTabPreviewControls(page: Page): Promise<void> {
  await expect(page.getByTestId("view-modes-tabs-panel")).toHaveCount(0);
  await expect(page.getByTestId("view-modes-tabs-panel-toggle")).toHaveCount(0);
  await expect(page.getByTestId("view-modes-tabs-resize-handle")).toHaveCount(
    0,
  );
  await expect(page.getByText("Tab Preview", { exact: true })).toHaveCount(0);
}

async function getActiveAndInactiveViewModeIds(page: Page): Promise<{
  activeViewModeId: string;
  inactiveViewModeId: string;
}> {
  const payload = (await loadProjectConfig(
    page,
  )) as LoadProjectConfigWithViewModes;
  const viewModes = payload.projectConfig?.viewModes ?? {};
  const activeViewModeId = payload.projectConfig?.activeViewModeId;
  if (!activeViewModeId) {
    throw new Error("Expected an active view mode id.");
  }
  const inactiveViewModeId = Object.keys(viewModes).find(
    (modeId) => modeId !== activeViewModeId,
  );
  if (!inactiveViewModeId) {
    throw new Error("Expected at least one inactive view mode id.");
  }
  return { activeViewModeId, inactiveViewModeId };
}

async function expectActiveViewModeId(
  page: Page,
  expectedViewModeId: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const payload = (await loadProjectConfig(
          page,
        )) as LoadProjectConfigWithViewModes;
        return payload.projectConfig?.activeViewModeId ?? null;
      },
      { timeout: 15000 },
    )
    .toBe(expectedViewModeId);
}

function getViewModeRowLocator(page: Page, viewModeId: string): Locator {
  return page
    .getByTestId(`view-mode-row-${viewModeId}`)
    .or(page.getByTestId(`view-mode-edit-row-${viewModeId}`))
    .or(
      page.locator(
        `[data-testid="overview-view-mode-row"][data-view-mode-id="${viewModeId}"]`,
      ),
    )
    .or(
      page.locator(
        `[data-testid="overview-view-mode-edit-row"][data-view-mode-id="${viewModeId}"]`,
      ),
    );
}

async function selectViewModeRow(
  page: Page,
  viewModeId: string,
): Promise<void> {
  const readonlyRow = page
    .getByTestId(`view-mode-row-${viewModeId}`)
    .or(
      page.locator(
        `[data-testid="overview-view-mode-row"][data-view-mode-id="${viewModeId}"]`,
      ),
    );
  if ((await readonlyRow.count()) > 0) {
    await expect(readonlyRow).toBeVisible();
    await expect(readonlyRow).toBeEnabled();
    await readonlyRow.click();
    return;
  }

  const editRow = page
    .getByTestId(`view-mode-edit-row-${viewModeId}`)
    .or(
      page.locator(
        `[data-testid="overview-view-mode-edit-row"][data-view-mode-id="${viewModeId}"]`,
      ),
    );
  await expect(editRow).toBeVisible();
  // In edit mode, clicking the input suppresses bubbling; dispatch click on the row.
  await editRow.dispatchEvent("click");
}

test.describe.serial("view modes pane without tab preview panel", () => {
  test("keeps mode list behavior and never renders legacy tab preview controls", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewVis: true,
      overviewTab: "ViewModes",
      overviewWidth: NARROW_OVERVIEW_WIDTH,
      overviewTrueWidth: NARROW_OVERVIEW_WIDTH,
    });
    await ensureAppReady(page);

    const projectContext = await openIsolatedProject(page);
    try {
      await ensureAtLeastTwoViewModes(page, projectContext.projectConfigId);
      await ensureOneTabbedViewMode(page, projectContext.projectConfigId);
      await setOverviewTab(page, "ViewModes");
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForReady(page);

      const pane = page.getByTestId("view-modes-pane");
      await expect(pane).toBeVisible();
      await assertNoTabPreviewControls(page);

      const { inactiveViewModeId } =
        await getActiveAndInactiveViewModeIds(page);
      const narrowRow = getViewModeRowLocator(page, inactiveViewModeId);
      await expect(narrowRow).toBeVisible();
      await selectViewModeRow(page, inactiveViewModeId);
      await expectActiveViewModeId(page, inactiveViewModeId);

      await setOverviewWidth(page, WIDE_OVERVIEW_WIDTH);
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForReady(page);
      await assertNoTabPreviewControls(page);

      const {
        activeViewModeId: wideActiveViewModeId,
        inactiveViewModeId: wideInactiveViewModeId,
      } = await getActiveAndInactiveViewModeIds(page);
      expect(wideInactiveViewModeId).not.toBe(wideActiveViewModeId);
      const wideRow = getViewModeRowLocator(page, wideInactiveViewModeId);
      await expect(wideRow).toBeVisible();
      await selectViewModeRow(page, wideInactiveViewModeId);
      await expectActiveViewModeId(page, wideInactiveViewModeId);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
