import { expect, test, type Page } from "@playwright/test";
import type { ProjectStateSingleConfigWithCompletedOpIDs } from "utils/generatedTypes";
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
    const { useReactFlow } = await import("/src/forks/xyflow/core/store");
    useReactFlow.setState({
      transform: [x, y, zoom],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
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
    const { useReactFlow } = await import("/src/forks/xyflow/core/store");
    const [x, y, zoom] = useReactFlow.getState().transform;
    return { x, y, zoom };
  });
}

async function applyBackendProjectStateUpdate(
  page: Page,
  payload: ProjectStateSingleConfigWithCompletedOpIDs,
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
      await postBackend<ProjectStateSingleConfigWithCompletedOpIDs>(
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
