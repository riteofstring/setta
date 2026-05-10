import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createChildSectionsFromFrontend,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getViewportBoundsForPlacement,
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
    throw new Error(`Missing sectionId when creating section type ${implType}.`);
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
    const ids = await parentNode.locator("[data-section-id]").evaluateAll(
      (nodes) => {
        const output = new Set<string>();
        for (const node of nodes) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }
          const id = node.dataset.sectionId;
          if (id) {
            output.add(id);
          }
        }
        return Array.from(output);
      },
    );
    return ids.filter((id) => id !== parentId);
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

      await page.getByRole("button", { name: "fit view" }).click();

      // Hover the parent node so agentic handles are visible.
      await parentNode.hover();

      const parentTargetHandle = page.locator(
        `.react-flow__handle[data-nodeid="${parentId}"][data-handleid="agentic-edge-target"]`,
      );
      const childTargetHandle = page.locator(
        `.react-flow__handle[data-nodeid="${childId}"][data-handleid="agentic-edge-target"]`,
      );

      await expect(parentTargetHandle).toBeVisible();
      await expect(childTargetHandle).toBeVisible();

      // The child callable is rendered below the list root, so its handle should
      // be significantly lower than the parent's. Previously the child's search
      // measurement could shift the parent's handles because the CSS var lived on
      // the shared react-flow node wrapper.
      await expect
        .poll(
          async () => {
            const [parentBox, childBox] = await Promise.all([
              parentTargetHandle.boundingBox(),
              childTargetHandle.boundingBox(),
            ]);
            if (!parentBox || !childBox) {
              return 0;
            }
            const parentCenterY = parentBox.y + parentBox.height / 2;
            const childCenterY = childBox.y + childBox.height / 2;
            return childCenterY - parentCenterY;
          },
          { timeout: 3000 },
        )
        .toBeGreaterThanOrEqual(40);

      const childScope = page.locator(`[data-section-id="${childId}"]`);
      const childSearch = childScope.locator("search.section-search");
      await expect(childSearch).toBeVisible();

      await expect
        .poll(
          async () => {
            const [searchBox, childBox] = await Promise.all([
              childSearch.boundingBox(),
              childTargetHandle.boundingBox(),
            ]);
            if (!searchBox || !childBox) {
              return 999;
            }
            const searchCenterY = searchBox.y + searchBox.height / 2;
            const handleCenterY = childBox.y + childBox.height / 2;
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
