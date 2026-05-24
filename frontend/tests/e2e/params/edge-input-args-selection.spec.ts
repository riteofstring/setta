import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addKwargFromFrontend,
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  setSectionEdgeInputsFromFrontend,
  setSectionPinnedParamsFromFrontend,
} from "../helpers";

function getModKey(): "Control" | "Meta" {
  return process.platform === "darwin" ? "Meta" : "Control";
}

async function clickGpuSourceElement(element: Locator): Promise<void> {
  await expect(element).toBeVisible();
  await element.evaluate((target) => {
    if (!(target instanceof HTMLElement)) {
      throw new Error("Expected GPU source target to be an HTMLElement.");
    }
    target.click();
  });
}

async function createDictSection(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }

  const response = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType: "Dict",
    viewportBounds,
  });
  const sectionId = response?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating dict section.");
  }
  return sectionId;
}

async function addSingleKwargAndReturnId(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<string> {
  await addKwargFromFrontend(page, { projectConfigId, sectionId });

  await expect
    .poll(async () => await readShownParamState(page, sectionId), {
      timeout: 20000,
    })
    .toMatchObject({ unpinned: expect.arrayContaining([expect.any(String)]) });

  const [paramId] = (await readShownParamState(page, sectionId)).unpinned;
  if (!paramId) {
    throw new Error("Missing shown kwarg id after adding a kwarg.");
  }
  return paramId;
}

async function readShownParamState(
  page: Page,
  sectionId: string,
): Promise<{
  edgeInputParams: string[];
  pinned: string[];
  selectedParams: string[];
  unpinned: string[];
}> {
  return await page.evaluate(async (targetSectionId) => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const { getCurrEffectiveSectionImplWithTypeGuard } = await import(
      "/src/state/actions/sectionInfos.ts"
    );
    const { isBaseSectionWithParamsImpl } = await import(
      "/src/utils/generatedTypes.ts"
    );
    const state = useProjectState.getState();
    const variantId = state.projectConfig.sectionVariantMap[targetSectionId];
    const shown = variantId ? state.shownParamIds[variantId] : null;
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      targetSectionId,
      isBaseSectionWithParamsImpl,
    );
    return {
      edgeInputParams: impl.edgeInputParams ?? [],
      pinned: shown?.pinned.topLevelParamIds ?? [],
      selectedParams: impl.selectedParams ?? [],
      unpinned: shown?.unpinned.topLevelParamIds ?? [],
    };
  }, sectionId);
}

async function readSectionPortAnchor(
  page: Page,
  sectionId: string,
  paramId: string,
): Promise<{
  id: string;
  kind: string;
  localPosition: { x: number; y: number };
} | null> {
  return await page.evaluate(
    async ({ targetParamId, targetSectionId }) => {
      const { useLocalStorage, useProjectState } = await import(
        "/src/state/definitions.ts"
      );
      const { getProjectGpuFlowScene } = await import(
        "/src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.ts"
      );
      const scene = getProjectGpuFlowScene(useProjectState.getState(), {
        darkMode: useLocalStorage.getState().darkMode,
      });
      const section = scene.sections.find(
        (candidate) => candidate.sectionId === targetSectionId,
      );
      return (
        section?.portAnchors.find(
          (candidate) => candidate.id === targetParamId,
        ) ?? null
      );
    },
    { targetParamId: paramId, targetSectionId: sectionId },
  );
}

async function waitForParamState(
  page: Page,
  sectionId: string,
  expected: Partial<Awaited<ReturnType<typeof readShownParamState>>>,
): Promise<void> {
  await expect
    .poll(async () => await readShownParamState(page, sectionId), {
      timeout: 20000,
    })
    .toMatchObject(expected);
}

test.describe.serial("edge input args", () => {
  test("edge input params produce GPU input port anchors", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const projectConfigId = projectContext.projectConfigId;
      const sectionId = await createDictSection(page, projectConfigId);
      const paramId = await addSingleKwargAndReturnId(
        page,
        projectConfigId,
        sectionId,
      );

      await setSectionEdgeInputsFromFrontend(page, {
        projectConfigId,
        sectionId,
        edgeInputParams: [paramId],
      });

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      await expect(sectionNode).toBeVisible();
      await expect
        .poll(async () => await readSectionPortAnchor(page, sectionId, paramId))
        .toMatchObject({
          id: paramId,
          kind: "input",
          localPosition: {
            x: expect.any(Number),
            y: expect.any(Number),
          },
        });
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("can select an edge arg and pin it back into pinned params", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const projectConfigId = projectContext.projectConfigId;
      const sectionId = await createDictSection(page, projectConfigId);
      const paramId = await addSingleKwargAndReturnId(
        page,
        projectConfigId,
        sectionId,
      );

      await setSectionEdgeInputsFromFrontend(page, {
        projectConfigId,
        sectionId,
        edgeInputParams: [paramId],
      });
      await waitForParamState(page, sectionId, {
        edgeInputParams: [paramId],
      });

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      const edgeRow = sectionNode.locator(
        `[data-edge-param-id="${paramId}"][data-edge-param-side="in"]`,
      );
      await expect(edgeRow).toBeVisible();

      // Select the edge arg using the same param-select shortcut (default: Mod+Shift).
      const modKey = getModKey();
      await page.keyboard.down(modKey);
      await page.keyboard.down("Shift");
      await clickGpuSourceElement(edgeRow);
      await page.keyboard.up("Shift");
      await page.keyboard.up(modKey);

      await waitForParamState(page, sectionId, {
        selectedParams: [paramId],
      });

      const pinButton = sectionNode.getByLabel("Pin selected args");
      await expect(pinButton).toBeEnabled();
      await clickGpuSourceElement(pinButton);

      await waitForParamState(page, sectionId, {
        edgeInputParams: [],
        pinned: [paramId],
      });
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("can select an edge arg and unlink it back into unpinned params", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const projectConfigId = projectContext.projectConfigId;
      const sectionId = await createDictSection(page, projectConfigId);
      const paramId = await addSingleKwargAndReturnId(
        page,
        projectConfigId,
        sectionId,
      );

      // Make the param pinned, then convert it into an edge input; unlink should move it
      // to the unpinned list (ie, also remove it from pinnedParams).
      await setSectionPinnedParamsFromFrontend(page, {
        projectConfigId,
        sectionId,
        pinnedParams: [paramId],
      });
      await setSectionEdgeInputsFromFrontend(page, {
        projectConfigId,
        sectionId,
        edgeInputParams: [paramId],
      });
      await waitForParamState(page, sectionId, {
        edgeInputParams: [paramId],
      });

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      const edgeRow = sectionNode.locator(
        `[data-edge-param-id="${paramId}"][data-edge-param-side="in"]`,
      );
      await expect(edgeRow).toBeVisible();

      const modKey = getModKey();
      await page.keyboard.down(modKey);
      await page.keyboard.down("Shift");
      await clickGpuSourceElement(edgeRow);
      await page.keyboard.up("Shift");
      await page.keyboard.up(modKey);

      await waitForParamState(page, sectionId, {
        selectedParams: [paramId],
      });

      const unlinkButton = sectionNode.getByLabel(
        "Convert selected edge args back to params",
      );
      await expect(unlinkButton).toBeEnabled();
      await clickGpuSourceElement(unlinkButton);

      await waitForParamState(page, sectionId, {
        edgeInputParams: [],
        pinned: [],
        unpinned: [paramId],
      });
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
