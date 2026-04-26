import { expect, test, type Page } from "@playwright/test";
import type { ProjectStateBackendUpdate } from "testUtils/projectStateBackendUpdate";
import {
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
} from "../helpers";

async function setViewportTransform(
  page: Page,
  transform: { x: number; y: number; zoom: number },
): Promise<void> {
  await page.evaluate(async ({ x, y, zoom }) => {
    const { gpuFlowViewportStore } = await import(
      "/src/gpuFlow/viewportStore.ts"
    );
    const viewportStore = gpuFlowViewportStore.getState();
    viewportStore.setTransform({ x, y, zoom });
    viewportStore.setFitViewInitializationState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
    });
    window.reactFlowZoom = zoom;
  }, transform);
}

async function getViewportTransform(page: Page): Promise<{
  x: number;
  y: number;
  zoom: number;
}> {
  return await page.evaluate(async () => {
    const { getViewport } = await import("/src/gpuFlow/viewportActions.ts");
    return getViewport();
  });
}

async function applyBackendProjectStateUpdate(
  page: Page,
  payload: ProjectStateBackendUpdate,
): Promise<void> {
  await page.evaluate(async (stateUpdate) => {
    const { processProjectStateUpdateFromBackend } = await import(
      "/src/state/actions/sectionInfos"
    );
    processProjectStateUpdateFromBackend(stateUpdate);
  }, payload);
}

test("stale backend project sync does not clobber a newer local viewport", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const created = await createTopLevelSectionFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      implType: "Callable",
    });
    if (!created?.sectionId) {
      throw new Error("Expected callable section to be created.");
    }

    const staleState =
      await postBackend<ProjectStateBackendUpdate>(
        page,
        "/getLatestProjectState",
        { projectConfigId: projectContext.projectConfigId },
      );
    if (!staleState) {
      throw new Error("Missing latest project state payload.");
    }

    await setViewportTransform(page, { x: 180, y: 120, zoom: 0.6 });
    await expect
      .poll(async () => {
        const viewport = await getViewportTransform(page);
        return Math.round(viewport.zoom * 100);
      })
      .toBe(60);

    await applyBackendProjectStateUpdate(page, staleState);

    await expect
      .poll(async () => {
        const viewport = await getViewportTransform(page);
        return Math.round(viewport.zoom * 100);
      })
      .toBe(60);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
