import { expect, test, type Page } from "@playwright/test";
import {
  applyProjectMutationsFromFrontend,
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  openIsolatedProject,
} from "../helpers";

type ImplType = "Code" | "Group";

test("ui-only selection drag grouping includes the full selected set in browser runtime", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const firstSectionId = await createTopLevelSection(
      page,
      projectContext.projectConfigId,
      "Group",
    );
    const secondSectionId = await createTopLevelSection(
      page,
      projectContext.projectConfigId,
      "Group",
    );

    await placeSections(page, projectContext.projectConfigId, {
      [firstSectionId]: { x: 120, y: 120 },
      [secondSectionId]: { x: 360, y: 120 },
    });

    await expect
      .poll(async () => {
        const positions = await readNodePositions(page, [
          firstSectionId,
          secondSectionId,
        ]);
        return (
          positions[firstSectionId] !== null &&
          positions[secondSectionId] !== null
        );
      })
      .toBe(true);

    // Seed the UI-only selection so the test exercises the new single-source
    // selection path instead of the sanitized durable store.
    await setFrontendActiveIds(page, [firstSectionId, secondSectionId]);
    await expect
      .poll(async () => readFrontendActiveIds(page))
      .toEqual([firstSectionId, secondSectionId]);

    const firstNode = page
      .locator(`.react-flow__node[data-id="${firstSectionId}"]`)
      .first();
    const secondNode = page
      .locator(`.react-flow__node[data-id="${secondSectionId}"]`)
      .first();

    await expect(firstNode).toBeVisible();
    await expect(secondNode).toBeVisible();

    const beforePositions = await readNodePositions(page, [
      firstSectionId,
      secondSectionId,
    ]);
    // This runs the real browser-side drag grouping helper against live node
    // internals, then applies the same position update path the drag handler
    // uses so both selected nodes must move together.
    const draggedIds = await simulateGroupedDragStep(page, firstSectionId, {
      x: 140,
      y: 70,
    });

    expect([...draggedIds].sort()).toEqual(
      [firstSectionId, secondSectionId].sort(),
    );

    const afterPositions = await readNodePositions(page, [
      firstSectionId,
      secondSectionId,
    ]);
    const firstBefore = beforePositions[firstSectionId];
    const secondBefore = beforePositions[secondSectionId];
    const firstAfter = afterPositions[firstSectionId];
    const secondAfter = afterPositions[secondSectionId];

    expect(firstBefore).not.toBeNull();
    expect(secondBefore).not.toBeNull();
    expect(firstAfter).not.toBeNull();
    expect(secondAfter).not.toBeNull();

    if (!firstBefore || !secondBefore || !firstAfter || !secondAfter) {
      throw new Error("Missing node positions for multi-selection drag test.");
    }

    const firstDelta = {
      x: firstAfter.x - firstBefore.x,
      y: firstAfter.y - firstBefore.y,
    };
    const secondDelta = {
      x: secondAfter.x - secondBefore.x,
      y: secondAfter.y - secondBefore.y,
    };

    expect(firstDelta).toEqual({ x: 140, y: 70 });
    expect(secondDelta).toEqual(firstDelta);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

async function createTopLevelSection(
  page: Page,
  projectConfigId: string,
  implType: ImplType,
): Promise<string> {
  const response = await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType,
  });
  const sectionId = response?.sectionId;
  if (!sectionId) {
    throw new Error(`Missing section id for impl type ${implType}.`);
  }
  return sectionId;
}

async function placeSections(
  page: Page,
  projectConfigId: string,
  positionsById: Record<string, { x: number; y: number }>,
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId,
    operations: Object.entries(positionsById).map(([sectionId, position]) => ({
      routeName: "route_move_sections" as const,
      payload: {
        sectionIds: [sectionId],
        newParentId: null,
        newIndex: null,
        positionsById: {
          [sectionId]: position,
        },
        frontendOpId: null,
      },
    })),
  });
}

async function setFrontendActiveIds(
  page: Page,
  nextActiveIds: string[],
): Promise<void> {
  await page.evaluate(async (activeIds) => {
    const { setActiveSectionIds } = await import(
      "/src/state/actions/activeSections.ts"
    );
    setActiveSectionIds(activeIds, { syncMode: "ui-only" });
  }, nextActiveIds);
}

async function readFrontendActiveIds(page: Page): Promise<string[]> {
  return await page.evaluate(async () => {
    const { useActiveSectionUI } = await import(
      "/src/state/activeSectionUI.ts"
    );
    return [...useActiveSectionUI.getState().activeIds];
  });
}

async function readNodePositions(
  page: Page,
  sectionIds: string[],
): Promise<Record<string, { x: number; y: number } | null>> {
  return await page.evaluate(async (ids) => {
    const { useNodeInternals } = await import("/src/state/definitions.ts");
    const nodeInternals = useNodeInternals.getState().x;
    return Object.fromEntries(
      ids.map((id) => {
        const node = nodeInternals.get(id);
        return [id, node ? { x: node.position.x, y: node.position.y } : null];
      }),
    );
  }, sectionIds);
}

async function simulateGroupedDragStep(
  page: Page,
  draggedSectionId: string,
  delta: { x: number; y: number },
): Promise<string[]> {
  return await page.evaluate(
    async ({ deltaByAxis, sectionId }) => {
      const [{ getDragItems }, { useNodeInternals }, { updateNodePositions }] =
        await Promise.all([
          import("/src/forks/xyflow/core/hooks/utils.ts"),
          import("/src/state/definitions.ts"),
          import("/src/state/actions/nodeInternals.ts"),
        ]);
      const nodeInternals = useNodeInternals.getState().x;
      const draggedNode = nodeInternals.get(sectionId);
      if (!draggedNode) {
        throw new Error(`Missing node internals for ${sectionId}.`);
      }
      const dragItems = getDragItems(
        nodeInternals,
        {
          x: draggedNode.position.x + 12,
          y: draggedNode.position.y + 12,
        },
        sectionId,
      );
      updateNodePositions(
        dragItems.map((item) => ({
          ...item,
          position: {
            x: item.position.x + deltaByAxis.x,
            y: item.position.y + deltaByAxis.y,
          },
        })),
      );
      return dragItems.map((item) => item.id);
    },
    {
      sectionId: draggedSectionId,
      deltaByAxis: delta,
    },
  );
}
