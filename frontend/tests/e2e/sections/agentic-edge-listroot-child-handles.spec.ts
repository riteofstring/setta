import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChildSectionsFromFrontend,
  createTopLevelSectionFromFrontend,
  disableCanvasSidePanePointerInterception,
  ensureAppReady,
  getViewportBoundsForPlacement,
  hoverGpuFlowNode,
  openIsolatedProject,
} from "../helpers";

async function createTopLevelSection(
  page: Page,
  projectConfigId: string,
  implType: string,
): Promise<string> {
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve viewport bounds for section placement.");
  }
  const response = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType,
    viewportBounds,
  });
  const sectionId = response?.sectionId ?? null;
  if (!sectionId) {
    throw new Error(
      `Missing sectionId when creating section type ${implType}.`,
    );
  }
  return sectionId;
}

async function createChildSections(
  page: Page,
  projectConfigId: string,
  parentId: string,
  implType: string,
  numChildren: number,
): Promise<void> {
  await createChildSectionsFromFrontend(page, {
    projectConfigId,
    parentId,
    implType,
    numChildren,
    startIdx: null,
  });
}

async function getChildSectionIds(
  page: Page,
  parentId: string,
  minCount: number,
): Promise<string[]> {
  const parentNode = page.getByTestId(`rf__node-${parentId}`);
  await expect(parentNode).toBeVisible();

  const fetchIds = async () => {
    return page.evaluate((parentId) => {
      return import("/src/state/definitions.ts").then(({ useProjectState }) => {
        const state = useProjectState.getState();
        const variantId = state.projectConfig.sectionVariantMap[parentId];
        const implId = variantId
          ? state.sectionVariants[variantId]?.impl
          : undefined;
        const children = implId
          ? state.sectionImpls[implId]?.children
          : undefined;
        return Array.isArray(children) ? children : [];
      });
    }, parentId);
  };

  await expect.poll(fetchIds, { timeout: 10_000 }).toHaveLength(minCount);
  return await fetchIds();
}

test.describe.serial("agentic handles", () => {
  test("keeps parent handles independent from child callable handle alignment (list root)", async ({
    page,
  }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    await disableCanvasSidePanePointerInterception(page);

    try {
      const projectConfigId = projectContext.projectConfigId;
      const parentId = await createTopLevelSection(
        page,
        projectConfigId,
        "ListRoot",
      );

      // Ensure the parent has rendered before adding children. This avoids
      // racey websocket ordering when creating nested sections immediately
      // after creating the parent.
      const parentNode = page.getByTestId(`rf__node-${parentId}`);
      await expect(parentNode).toBeVisible();

      await createChildSections(page, projectConfigId, parentId, "Callable", 1);
      const [childId] = await getChildSectionIds(page, parentId, 1);
      if (!childId) {
        throw new Error("Missing child callable section id.");
      }
      const childNode = page.getByTestId(`rf__node-${childId}`);
      await expect(childNode).toBeVisible();

      await page
        .getByRole("button", { name: "fit view" })
        .click({ force: true });

      const parentTargetHandle = page.locator(
        `.setta-gpu-flow__handle[data-nodeid="${parentId}"][data-handleid="agentic-edge-target"]`,
      );
      const childTargetHandle = page.locator(
        `.setta-gpu-flow__handle[data-nodeid="${childId}"][data-handleid="agentic-edge-target"]`,
      );

      await expect(parentTargetHandle).toBeAttached();
      await expect(childTargetHandle).toBeAttached();
      await hoverGpuFlowNode(page, childNode);
      await expect(childTargetHandle).toBeVisible();

      // The child callable is rendered below the list root, so its handle should
      // be significantly lower than the parent's. Previously the child's search
      // measurement could shift the parent's handles because the CSS var lived on
      // the shared GPU flow node wrapper.
      await expect
        .poll(
          async () => {
            const [parentRect, childRect] = await Promise.all([
              parentTargetHandle.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  height: rect.height,
                  y: rect.y,
                };
              }),
              childTargetHandle.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  height: rect.height,
                  y: rect.y,
                };
              }),
            ]);
            if (parentRect.height <= 0 || childRect.height <= 0) {
              return 0;
            }
            const parentCenterY = parentRect.y + parentRect.height / 2;
            const childCenterY = childRect.y + childRect.height / 2;
            return childCenterY - parentCenterY;
          },
          { timeout: 3000 },
        )
        .toBeGreaterThanOrEqual(30);

      const childScope = page.locator(`[data-section-id="${childId}"]`);
      const childSearch = childScope.locator("search.section-search");
      await expect(childSearch).toBeVisible();

      await expect
        .poll(
          async () => {
            const [searchRect, childRect] = await Promise.all([
              childSearch.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  height: rect.height,
                  y: rect.y,
                };
              }),
              childTargetHandle.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  height: rect.height,
                  y: rect.y,
                };
              }),
            ]);
            if (searchRect.height <= 0 || childRect.height <= 0) {
              return 999;
            }
            const searchCenterY = searchRect.y + searchRect.height / 2;
            const handleCenterY = childRect.y + childRect.height / 2;
            return Math.abs(handleCenterY - searchCenterY);
          },
          { timeout: 3000 },
        )
        .toBeLessThanOrEqual(3);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
