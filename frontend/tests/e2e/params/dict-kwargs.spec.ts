import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  disableCanvasSidePanePointerInterception,
  ensureAppReady,
  getViewportBoundsForPlacement,
  hoverGpuFlowNode,
  openIsolatedProject,
} from "../helpers";

async function clickGpuSourceButton(button: Locator): Promise<void> {
  await expect(button).toBeVisible();
  await button.evaluate((element) => {
    if (!(element instanceof HTMLElement)) {
      throw new Error("Expected GPU source button to be an HTMLElement.");
    }
    element.click();
  });
}

async function readShownKwargIds(
  page: Page,
  sectionId: string,
): Promise<string[]> {
  return await page.evaluate(async (targetSectionId) => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const state = useProjectState.getState();
    const variantId = state.projectConfig.sectionVariantMap[targetSectionId];
    if (!variantId) {
      return [];
    }
    return state.shownParamIds[variantId]?.unpinned.topLevelParamIds ?? [];
  }, sectionId);
}

async function waitForShownKwargIds(
  page: Page,
  sectionId: string,
  count: number,
): Promise<string[]> {
  await expect
    .poll(async () => await readShownKwargIds(page, sectionId), {
      timeout: 20000,
    })
    .toHaveLength(count);
  return await readShownKwargIds(page, sectionId);
}

test("dict kwargs hydrate after clicking the add arg button", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  await disableCanvasSidePanePointerInterception(page);
  const projectConfigId = projectContext.projectConfigId;
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }
  const sectionResponse = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType: "Dict",
    viewportBounds,
  });
  const sectionId = sectionResponse?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating dict section.");
  }

  try {
    const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
    await expect(sectionNode).toBeVisible();
    await hoverGpuFlowNode(page, sectionNode);
    await clickGpuSourceButton(
      sectionNode.getByRole("button", { name: "Add arg" }),
    );

    const [paramId] = await waitForShownKwargIds(page, sectionId, 1);
    expect(paramId).toBeTruthy();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("dict kwargs can be added and deleted back to empty without crashing", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  await disableCanvasSidePanePointerInterception(page);
  const projectConfigId = projectContext.projectConfigId;
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }
  const sectionResponse = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType: "Dict",
    viewportBounds,
  });
  const sectionId = sectionResponse?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating dict section.");
  }

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const onPageError = (error: Error) => {
    const message = error.stack || error.message || String(error);
    if (message) {
      pageErrors.push(message);
    }
  };
  const onConsole = (msg: import("@playwright/test").ConsoleMessage) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  try {
    const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
    await expect(sectionNode).toBeVisible();
    const addArgButton = sectionNode.getByRole("button", { name: "Add arg" });
    const removeArgButton = sectionNode.getByRole("button", {
      name: "Remove arg",
    });
    await hoverGpuFlowNode(page, sectionNode);
    for (let index = 0; index < 6; index += 1) {
      await clickGpuSourceButton(addArgButton);
      await waitForShownKwargIds(page, sectionId, index + 1);
    }

    for (let index = 0; index < 6; index += 1) {
      await clickGpuSourceButton(removeArgButton);
      await waitForShownKwargIds(page, sectionId, 5 - index);
    }
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await expect(page.getByText("Unhandled Thrown Error!")).toHaveCount(0);
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    await cleanupIsolatedProject(page, projectContext);
  }
});
