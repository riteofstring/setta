import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  clearProjectChatWindows,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      sectionVariantMap?: Record<string, string>;
      viewport?: { x: number; y: number; zoom: number } | null;
      viewportInitialized?: boolean;
    };
    parentSectionMap?: Record<string, string | null>;
  };
};

async function getLatestProjectState(
  page: Page,
  projectConfigId: string,
): Promise<LatestProjectStateResponse> {
  return (
    (await postBackend<LatestProjectStateResponse>(
      page,
      "/getLatestProjectState",
      {
        projectConfigId,
      },
    )) ?? {}
  );
}

async function triggerProjectHistoryMutation(
  page: Page,
  direction: "undo" | "redo",
): Promise<void> {
  await page.evaluate(async (nextDirection) => {
    const module = await import("/src/state/actions/undo");
    if (nextDirection === "undo") {
      module.undoProjectState();
      return;
    }
    module.redoProjectState();
  }, direction);
}

async function getViewport(page: Page): Promise<{
  x: number;
  y: number;
  zoom: number;
}> {
  return page.evaluate(async () => {
    const { getViewport } = await import(
      "/src/forks/xyflow/core/hooks/useViewportHelper"
    );
    return getViewport();
  });
}

async function getChildCount(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<number> {
  const latest = await getLatestProjectState(page, projectConfigId);
  const parentSectionMap = latest.projectState?.parentSectionMap ?? {};
  return Object.values(parentSectionMap).filter(
    (parentId) => parentId === sectionId,
  ).length;
}

async function clickRepeatedly(button: Locator, times: number): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    await button.click();
  }
}

test("list-root history redoes the restored section on the first step and reload keeps the persisted viewport", async ({
  page,
}) => {
  await seedLocalStorage(page, {
    overviewTab: "Overview",
    overviewVis: true,
    uiEditorVis: false,
    colorMode: "light",
    darkMode: false,
  });
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  await clearProjectChatWindows(page);

  try {
    const created = await createTopLevelSectionFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      implType: "ListRoot",
    });
    const sectionId = created?.sectionId;
    if (!sectionId) {
      throw new Error("Failed to create list root section.");
    }

    const listNode = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
    await expect(listNode).toBeVisible();
    const incrementButton = listNode.locator("button.gg-math-plus");
    const decrementButton = listNode.locator("button.gg-math-minus");

    await clickRepeatedly(incrementButton, 8);
    await expect
      .poll(() =>
        getChildCount(page, projectContext.projectConfigId, sectionId),
      )
      .toBe(8);

    await clickRepeatedly(decrementButton, 8);
    await expect
      .poll(() =>
        getChildCount(page, projectContext.projectConfigId, sectionId),
      )
      .toBe(0);

    await clickRepeatedly(incrementButton, 4);
    await expect
      .poll(() =>
        getChildCount(page, projectContext.projectConfigId, sectionId),
      )
      .toBe(4);

    for (let i = 0; i < 21; i += 1) {
      await triggerProjectHistoryMutation(page, "undo");
    }
    await expect
      .poll(async () => {
        const latest = await getLatestProjectState(
          page,
          projectContext.projectConfigId,
        );
        return Boolean(
          latest.projectState?.projectConfig?.sectionVariantMap?.[sectionId],
        );
      })
      .toBe(false);

    await triggerProjectHistoryMutation(page, "redo");
    await expect
      .poll(async () => {
        const latest = await getLatestProjectState(
          page,
          projectContext.projectConfigId,
        );
        return Boolean(
          latest.projectState?.projectConfig?.sectionVariantMap?.[sectionId],
        );
      })
      .toBe(true);
    await expect
      .poll(() =>
        getChildCount(page, projectContext.projectConfigId, sectionId),
      )
      .toBe(0);
    await expect(listNode).toBeVisible();

    for (let i = 0; i < 20; i += 1) {
      await triggerProjectHistoryMutation(page, "redo");
    }
    await expect
      .poll(() =>
        getChildCount(page, projectContext.projectConfigId, sectionId),
      )
      .toBe(4);

    const viewportBeforeReload = await getViewport(page);
    await expect
      .poll(async () => {
        const latest = await getLatestProjectState(
          page,
          projectContext.projectConfigId,
        );
        if (!latest.projectState?.projectConfig?.viewportInitialized) {
          return null;
        }
        return latest.projectState.projectConfig.viewport ?? null;
      })
      .not.toBeNull();
    const persistedViewportBeforeReload =
      (await getLatestProjectState(page, projectContext.projectConfigId))
        .projectState?.projectConfig?.viewport ?? null;
    if (!persistedViewportBeforeReload) {
      throw new Error("Expected persisted viewport before reload.");
    }

    expect(viewportBeforeReload.x).toBeCloseTo(
      persistedViewportBeforeReload.x,
      1,
    );
    expect(viewportBeforeReload.y).toBeCloseTo(
      persistedViewportBeforeReload.y,
      1,
    );
    expect(viewportBeforeReload.zoom).toBeCloseTo(
      persistedViewportBeforeReload.zoom,
      2,
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".canvas-flow__canvas");
    await expect(listNode).toBeVisible();

    const viewportAfterReload = await getViewport(page);
    expect(viewportAfterReload.x).toBeCloseTo(
      persistedViewportBeforeReload.x,
      1,
    );
    expect(viewportAfterReload.y).toBeCloseTo(
      persistedViewportBeforeReload.y,
      1,
    );
    expect(viewportAfterReload.zoom).toBeCloseTo(
      persistedViewportBeforeReload.zoom,
      2,
    );

    const latestAfterReload = await getLatestProjectState(
      page,
      projectContext.projectConfigId,
    );
    expect(
      latestAfterReload.projectState?.projectConfig?.viewportInitialized,
    ).toBe(true);
    expect(latestAfterReload.projectState?.projectConfig?.viewport).not.toBe(
      null,
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
