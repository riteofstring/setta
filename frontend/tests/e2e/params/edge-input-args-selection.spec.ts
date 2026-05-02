import { expect, test, type Page } from "@playwright/test";
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

  const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
  const paramContainer = sectionNode.locator(
    `[id^="ParamContainer-${sectionId}-"]`,
  );
  const firstParam = paramContainer.first();
  await expect(firstParam).toBeVisible({ timeout: 20000 });

  const id = await firstParam.getAttribute("id");
  if (!id) {
    throw new Error("Missing ParamContainer id attribute.");
  }
  const match = id.match(new RegExp(`^ParamContainer-${sectionId}-(.+)$`));
  const paramId = match?.[1] ?? null;
  if (!paramId) {
    throw new Error(`Unable to parse param id from "${id}".`);
  }
  return paramId;
}

test.describe.serial("edge input args", () => {
  test("edge connector dots have hover/active colors", async ({ page }) => {
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
      const handle = page.locator(
        `.setta-gpu-flow__handle.arg-edge-handle[data-nodeid="${sectionId}"][data-handleid="${paramId}"]`,
      );
      await expect(handle).toBeVisible();

      const expectedHoverBlue = "rgb(59, 130, 246)"; // blue-500
      const expectedActiveCyan = "rgb(103, 232, 249)"; // cyan-300

      await handle.hover();
      await expect(handle).toHaveCSS("background-color", expectedHoverBlue);

      // Verify active state while mouse is held down (fast transition to cyan),
      // and that it returns to hover (blue) on release.
      const handleBox = await handle.boundingBox();
      if (!handleBox) {
        throw new Error("Missing handle bounding box for hover/active checks.");
      }
      await page.mouse.move(
        handleBox.x + handleBox.width / 2,
        handleBox.y + handleBox.height / 2,
      );
      await page.mouse.down();
      await expect(handle).toHaveCSS("background-color", expectedActiveCyan);
      await page.mouse.up();
      await expect(handle).toHaveCSS("background-color", expectedHoverBlue);

      // Smoke-check that we didn't break the section node interactions.
      await expect(sectionNode).toBeVisible();
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

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      const edgeRow = sectionNode.locator(
        `[data-edge-param-id="${paramId}"][data-edge-param-side="in"]`,
      );
      await expect(edgeRow).toBeVisible();

      // When a param becomes an edge input, it is removed from the pinned/unpinned lists.
      await expect(
        sectionNode.locator(`#ParamContainer-${sectionId}-${paramId}`),
      ).toHaveCount(0);

      // Connector dot should be larger + sit half outside the node edge.
      const handle = page.locator(
        `.setta-gpu-flow__handle.arg-edge-handle[data-nodeid="${sectionId}"][data-handleid="${paramId}"]`,
      );
      await expect(handle).toBeVisible();
      const nodeBox = await sectionNode.boundingBox();
      const handleBox = await handle.boundingBox();
      if (!nodeBox || !handleBox) {
        throw new Error("Missing bounding boxes for node/handle assertions.");
      }
      expect(handleBox.x).toBeLessThan(nodeBox.x);
      expect(handleBox.width).toBeGreaterThanOrEqual(10);

      // Select the edge arg using the same param-select shortcut (default: Mod+Shift).
      const modKey = getModKey();
      await page.keyboard.down(modKey);
      await page.keyboard.down("Shift");
      await edgeRow.click();
      await page.keyboard.up("Shift");
      await page.keyboard.up(modKey);

      await expect(edgeRow).toHaveClass(/!bg-blue-700/);

      const pinButton = sectionNode.getByLabel("Pin selected args");
      await expect(pinButton).toBeEnabled();
      await pinButton.click();

      await expect(edgeRow).toHaveCount(0);
      await expect(sectionNode.getByText("Pinned Params")).toBeVisible();
      await expect(
        sectionNode.locator(`#ParamContainer-${sectionId}-${paramId}`),
      ).toBeVisible();
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

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      const edgeRow = sectionNode.locator(
        `[data-edge-param-id="${paramId}"][data-edge-param-side="in"]`,
      );
      await expect(edgeRow).toBeVisible();

      const modKey = getModKey();
      await page.keyboard.down(modKey);
      await page.keyboard.down("Shift");
      await edgeRow.click();
      await page.keyboard.up("Shift");
      await page.keyboard.up(modKey);

      await expect(edgeRow).toHaveClass(/!bg-blue-700/);

      const unlinkButton = sectionNode.getByLabel(
        "Convert selected edge args back to params",
      );
      await expect(unlinkButton).toBeEnabled();
      await unlinkButton.click();

      await expect(edgeRow).toHaveCount(0);
      await expect(sectionNode.getByText("Pinned Params")).toHaveCount(0);
      await expect(
        sectionNode.locator(`#ParamContainer-${sectionId}-${paramId}`),
      ).toBeVisible();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
