import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  getCurrentProjectConfigId,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
} from "../helpers";

type CreateSectionResponse = { sectionId?: string };
type LatestProjectStateResponse = {
  projectState: {
    projectConfig: {
      sectionVariantMap: Record<string, string>;
    };
    sectionVariants: Record<string, { impl: string }>;
    sectionImpls: Record<
      string,
      {
        type: string;
        codeObjVariantMap?: Record<string, string>;
        topLevelParamId?: string | null;
      }
    >;
  };
};

async function reloadCurrentProject(
  page: Page,
  expectedProjectConfigId: string,
): Promise<void> {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".react-flow__pane");
  await expect
    .poll(() => getCurrentProjectConfigId(page), { timeout: 20000 })
    .toBe(expectedProjectConfigId);
}

async function selectEdgeInputParam(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  paramId: string,
): Promise<void> {
  await postBackend(page, "/toggleParamSelected", {
    projectConfigId,
    sectionId,
    paramInfoId: paramId,
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

  const response = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Dict",
      viewportBounds,
    },
  );
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
  await postBackend(page, "/addKwarg", { projectConfigId, sectionId });

  let paramId: string | null = null;
  await expect
    .poll(
      async () => {
        const payload = await postBackend<LatestProjectStateResponse>(
          page,
          "/getLatestProjectState",
          { projectConfigId },
        );
        if (!payload) {
          return false;
        }
        const variantId =
          payload.projectState.projectConfig.sectionVariantMap[sectionId];
        if (!variantId) {
          return false;
        }
        const variant = payload.projectState.sectionVariants[variantId];
        if (!variant) {
          return false;
        }
        const impl = payload.projectState.sectionImpls[variant.impl];
        if (!impl || impl.type !== "Dict") {
          return false;
        }
        const paramIds = Object.keys(impl.codeObjVariantMap ?? {});
        if (paramIds.length === 0) {
          return false;
        }
        if (impl.topLevelParamId) {
          const kwargIds = paramIds.filter((id) => id !== impl.topLevelParamId);
          if (kwargIds.length > 0) {
            paramId = kwargIds[0] ?? null;
            return paramId !== null;
          }
        }
        paramId = paramIds[0] ?? null;
        return paramId !== null;
      },
      { timeout: 20000 },
    )
    .toBe(true);

  if (!paramId) {
    throw new Error("Missing backend param id after addKwarg.");
  }

  const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
  const paramContainer = sectionNode.locator(
    `#ParamContainer-${sectionId}-${paramId}`,
  );
  await expect(paramContainer).toBeVisible({ timeout: 20000 });
  return paramId;
}

test.describe.serial("edge input args", () => {
  test("edge connector dots have hover/active colors", async ({
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

      await postBackend(page, "/setSectionEdgeInputs", {
        projectConfigId,
        sectionId,
        edgeInputParams: [paramId],
      });
      await reloadCurrentProject(page, projectConfigId);

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      const edgeRow = sectionNode.locator(
        `[data-edge-param-id="${paramId}"][data-edge-param-side="in"]`,
      );
      await expect(edgeRow).toBeVisible({ timeout: 20000 });
      const handle = page.locator(
        `.react-flow__handle.arg-edge-handle[data-nodeid="${sectionId}"][data-handleid="${paramId}"]`,
      );
      await expect(handle).toHaveCount(1, { timeout: 20000 });
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

      await postBackend(page, "/setSectionEdgeInputs", {
        projectConfigId,
        sectionId,
        edgeInputParams: [paramId],
      });
      await reloadCurrentProject(page, projectConfigId);

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
        `.react-flow__handle.arg-edge-handle[data-nodeid="${sectionId}"][data-handleid="${paramId}"]`,
      );
      await expect(handle).toBeVisible();
      const nodeBox = await sectionNode.boundingBox();
      const handleBox = await handle.boundingBox();
      if (!nodeBox || !handleBox) {
        throw new Error("Missing bounding boxes for node/handle assertions.");
      }
      expect(handleBox.x).toBeLessThan(nodeBox.x);
      expect(handleBox.width).toBeGreaterThanOrEqual(10);

      await selectEdgeInputParam(page, projectConfigId, sectionId, paramId);

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
      await postBackend(page, "/setSectionPinnedParams", {
        projectConfigId,
        sectionId,
        pinnedParams: [paramId],
      });
      await postBackend(page, "/setSectionEdgeInputs", {
        projectConfigId,
        sectionId,
        edgeInputParams: [paramId],
      });
      await reloadCurrentProject(page, projectConfigId);

      const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
      const edgeRow = sectionNode.locator(
        `[data-edge-param-id="${paramId}"][data-edge-param-side="in"]`,
      );
      await expect(edgeRow).toBeVisible();

      await selectEdgeInputParam(page, projectConfigId, sectionId, paramId);

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
