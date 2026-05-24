import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  setCallableFromFrontend,
  setSectionPinnedParamsFromFrontend,
} from "../helpers";

const CALLABLE_NAME = "sorted";

async function readShownParamIds(
  page: Page,
  sectionId: string,
): Promise<{ pinned: string[]; unpinned: string[] }> {
  return await page.evaluate(async (targetSectionId) => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const state = useProjectState.getState();
    const variantId = state.projectConfig.sectionVariantMap[targetSectionId];
    const shown = variantId ? state.shownParamIds[variantId] : null;
    return {
      pinned: shown?.pinned.topLevelParamIds ?? [],
      unpinned: shown?.unpinned.topLevelParamIds ?? [],
    };
  }, sectionId);
}

async function readParamContentSurface(
  page: Page,
  sectionId: string,
  listKey: "pinned" | "unpinned",
): Promise<{ rowCount: number; viewportHeight: number } | null> {
  return await page.evaluate(
    async ({ targetListKey, targetSectionId }) => {
      const { useLocalStorage, useProjectState } = await import(
        "/src/state/definitions.ts"
      );
      const { getProjectGpuFlowScene } = await import(
        "/src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.ts"
      );
      const scene = getProjectGpuFlowScene(useProjectState.getState(), {
        darkMode: useLocalStorage.getState().darkMode,
      });
      const surface = scene.contentSurfaces.find(
        (candidate) =>
          candidate.id === `${targetSectionId}:param-content:${targetListKey}`,
      );
      if (!surface?.retainedScene) {
        return null;
      }
      return {
        rowCount: surface.retainedScene.rows.length,
        viewportHeight: surface.retainedScene.viewportRect.height,
      };
    },
    { targetListKey: listKey, targetSectionId: sectionId },
  );
}

test("params area uses section scroll and removes pinned resize handles", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const projectConfigId = projectContext.projectConfigId;
  const sectionId = await createCallableSection(page, projectConfigId);
  const minParamsHeight = 38;

  try {
    await setCallableFromFrontend(page, {
      projectConfigId,
      sectionId,
      callableName: CALLABLE_NAME,
      refetchParams: true,
    });

    const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
    await expect(sectionNode).toBeVisible();

    await expect
      .poll(
        async () => await readParamContentSurface(page, sectionId, "unpinned"),
      )
      .toMatchObject({
        rowCount: expect.any(Number),
        viewportHeight: expect.any(Number),
      });
    const latestSurface = await readParamContentSurface(
      page,
      sectionId,
      "unpinned",
    );
    expect(latestSurface?.rowCount ?? 0).toBeGreaterThan(0);
    expect(latestSurface?.viewportHeight ?? 0).toBeGreaterThanOrEqual(
      minParamsHeight,
    );
    await expect(page.locator(".pinned-resize-handle")).toHaveCount(0);
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [sectionId],
    });
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("unpinned area keeps its minimum height when pinned params are present", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const projectConfigId = projectContext.projectConfigId;
  const sectionId = await createCallableSection(page, projectConfigId);
  const minUnpinnedHeight = 36;

  try {
    await setCallableFromFrontend(page, {
      projectConfigId,
      sectionId,
      callableName: CALLABLE_NAME,
      refetchParams: true,
    });

    const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
    await expect(sectionNode).toBeVisible();

    const shownParamIds = await readShownParamIds(page, sectionId);
    const availableParamIds = [
      ...shownParamIds.pinned,
      ...shownParamIds.unpinned,
    ];
    if (availableParamIds.length < 2) {
      throw new Error("Need at least two params to keep an unpinned area.");
    }
    await setSectionPinnedParamsFromFrontend(page, {
      projectConfigId,
      sectionId,
      pinnedParams: [availableParamIds[0]],
    });
    await expect(sectionNode.locator("text=Pinned Params")).toBeVisible();
    await expect
      .poll(async () => {
        const latestShownParamIds = await readShownParamIds(page, sectionId);
        return {
          pinned: latestShownParamIds.pinned,
          unpinnedCount: latestShownParamIds.unpinned.length,
        };
      })
      .toEqual({
        pinned: [availableParamIds[0]],
        unpinnedCount: availableParamIds.length - 1,
      });

    await expect
      .poll(
        async () => await readParamContentSurface(page, sectionId, "unpinned"),
      )
      .toMatchObject({
        rowCount: expect.any(Number),
        viewportHeight: expect.any(Number),
      });
    const unpinnedSurface = await readParamContentSurface(
      page,
      sectionId,
      "unpinned",
    );
    expect(unpinnedSurface?.rowCount ?? 0).toBeGreaterThan(0);
    expect(unpinnedSurface?.viewportHeight ?? 0).toBeGreaterThanOrEqual(
      minUnpinnedHeight,
    );
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [sectionId],
    });
    await cleanupIsolatedProject(page, projectContext);
  }
});
