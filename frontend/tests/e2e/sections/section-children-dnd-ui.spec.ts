import { expect, test, type Page } from "@playwright/test";
import {
  applyProjectMutationsFromFrontend,
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  setSectionSizesFromFrontend,
} from "../helpers";

type TopLevelSectionLayout = { x: number; y: number; zIndex?: number };
type SectionDragGeometry = {
  height: number;
  width: number;
  x: number;
  y: number;
};
type SectionCore = { sharedModifier: { children?: string[] } };
type ProjectStateResponse = {
  projectConfig: {
    sectionVariantMap: Record<string, string>;
    topLevelSections: Record<string, TopLevelSectionLayout>;
  };
  parentSectionMap: Record<string, string | null>;
  sections: Record<string, SectionCore>;
  sectionVariants: Record<string, { impl: string }>;
  sectionImpls: Record<string, { type: string; children?: string[] }>;
};

type LatestProjectStateResponse = {
  projectState: ProjectStateResponse | null;
};

type ImplType = "Group" | "ListRoot" | "Code";

test("group section children can move via UI drag-and-drop", async ({
  page,
}) => {
  test.setTimeout(240000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });
  await ensureAppReady(page);

  const projectContext = await openIsolatedProject(page);

  try {
    const groupId = await createTopLevelSection(
      page,
      projectContext.projectConfigId,
      "Group",
    );
    const childAId = await createTopLevelSection(
      page,
      projectContext.projectConfigId,
      "Code",
    );
    const childBId = await createTopLevelSection(
      page,
      projectContext.projectConfigId,
      "Code",
    );
    const viewportBounds = await getViewportBoundsForPlacement(page);
    if (!viewportBounds) {
      throw new Error("Unable to resolve visible GPU pane bounds.");
    }
    const groupPosition = {
      x: viewportBounds.x + 40,
      y: viewportBounds.y + 40,
    };

    await placeSections(page, projectContext.projectConfigId, {
      [groupId]: groupPosition,
      [childAId]: { x: groupPosition.x + 520, y: groupPosition.y },
      [childBId]: { x: groupPosition.x + 520, y: groupPosition.y + 180 },
    });
    await setSectionSizesFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionSizes: {
        [groupId]: { height: 460, width: 430 },
        [childAId]: { height: 140, width: 330 },
        [childBId]: { height: 140, width: 330 },
      },
    });

    await applyProjectMutationsFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      operations: [
        {
          operationName: "moveSections",
          body: {
            sectionIds: [childAId],
            newParentId: groupId,
            newIndex: 0,
            positionsById: null,
            frontendOpId: null,
          },
        },
        {
          operationName: "moveSections",
          body: {
            sectionIds: [childBId],
            newParentId: groupId,
            newIndex: 1,
            positionsById: null,
            frontendOpId: null,
          },
        },
      ],
    });

    await expect
      .poll(async () => {
        const state = await loadLatestProjectState(
          page,
          projectContext.projectConfigId,
        );
        const children = getSectionChildren(state, groupId);
        return {
          parentA: state.parentSectionMap[childAId] ?? null,
          parentB: state.parentSectionMap[childBId] ?? null,
          hasA: children.includes(childAId),
          hasB: children.includes(childBId),
        };
      })
      .toEqual({
        parentA: groupId,
        parentB: groupId,
        hasA: true,
        hasB: true,
      });

    await dragNestedSectionBefore(page, childBId, childAId, async () => {
      const state = await loadLatestProjectState(
        page,
        projectContext.projectConfigId,
      );
      const children = getSectionChildren(state, groupId);
      const indexA = children.indexOf(childAId);
      const indexB = children.indexOf(childBId);
      return indexA >= 0 && indexB >= 0 && indexB < indexA;
    });

    await expect
      .poll(async () => {
        const state = await loadLatestProjectState(
          page,
          projectContext.projectConfigId,
        );
        const children = getSectionChildren(state, groupId);
        return {
          parentA: state.parentSectionMap[childAId] ?? null,
          parentB: state.parentSectionMap[childBId] ?? null,
          hasA: children.includes(childAId),
          hasB: children.includes(childBId),
        };
      })
      .toEqual({
        parentA: groupId,
        parentB: groupId,
        hasA: true,
        hasB: true,
      });
    expect(pageErrors).not.toContainEqual(
      expect.stringContaining("Duplicate GPU flow content surface"),
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

async function dragNestedSectionBefore(
  page: Page,
  sectionId: string,
  targetSectionId: string,
  isDone: () => Promise<boolean>,
): Promise<void> {
  await expect
    .poll(async () => {
      const geometry = await readSectionDragGeometry(page, [
        sectionId,
        targetSectionId,
      ]);
      return Boolean(geometry[sectionId] && geometry[targetSectionId]);
    })
    .toBe(true);

  await dragWithRetries(
    page,
    async (attempt) => {
      const geometry = await readSectionDragGeometry(page, [
        sectionId,
        targetSectionId,
      ]);
      const sourceGeometry = geometry[sectionId];
      const targetGeometry = geometry[targetSectionId];
      if (!sourceGeometry || !targetGeometry) {
        throw new Error("Missing section geometry for reorder drag.");
      }
      await performMovingFreeDrag(page, {
        start: await flowPointToClientPoint(page, {
          x: sourceGeometry.x + sourceGeometry.width * 0.5,
          y: sourceGeometry.y + Math.min(12, sourceGeometry.height / 2),
        }),
        target: await flowPointToClientPoint(page, {
          x: targetGeometry.x + targetGeometry.width * 0.5,
          y:
            targetGeometry.y +
            Math.max(4, targetGeometry.height * 0.04) -
            attempt * 2,
        }),
      });
    },
    isDone,
    "Failed to reorder nested section via UI drag.",
  );
}

async function dragWithRetries(
  page: Page,
  performDrag: (attempt: number) => Promise<void>,
  isDone: () => Promise<boolean>,
  failureMessage: string,
): Promise<void> {
  const attempts = process.env.CI ? 14 : 12;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await performDrag(attempt);

    let done = false;
    try {
      await expect.poll(isDone, { timeout: 15000 }).toBe(true);
      done = true;
    } catch {
      done = false;
    }

    if (done) {
      return;
    }
  }

  throw new Error(failureMessage);
}

async function performMovingFreeDrag(
  page: Page,
  points: {
    start: { x: number; y: number };
    target: { x: number; y: number };
  },
): Promise<void> {
  const { start, target } = points;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.move(target.x, target.y, { steps: 14 });
  await page.mouse.up();
}

async function readSectionDragGeometry(
  page: Page,
  sectionIds: readonly string[],
): Promise<Record<string, SectionDragGeometry | null>> {
  return await page.evaluate(async (ids) => {
    const { gpuFlowLayoutStore } = await import("/src/gpuFlow/layoutStore.ts");
    return Object.fromEntries(
      ids.map((id) => {
        const node = gpuFlowLayoutStore.getState().getNode(id);
        return [
          id,
          node && node.width !== null && node.height !== null
            ? {
                height: node.height,
                width: node.width,
                x: node.x,
                y: node.y,
              }
            : null,
        ];
      }),
    );
  }, sectionIds);
}

async function flowPointToClientPoint(
  page: Page,
  point: { x: number; y: number },
): Promise<{ x: number; y: number }> {
  return await page.evaluate(async (flowPoint) => {
    const [{ flowToScreenPosition }, { gpuFlowViewportStore }] =
      await Promise.all([
        import("/src/gpuFlow/viewportMath.ts"),
        import("/src/gpuFlow/viewportStore.ts"),
      ]);
    const pane = document.querySelector(".setta-gpu-flow__pane");
    if (!(pane instanceof HTMLElement)) {
      throw new Error("Missing GPU flow pane.");
    }
    const paneRect = pane.getBoundingClientRect();
    const screenPoint = flowToScreenPosition(
      flowPoint,
      gpuFlowViewportStore.getState().transform,
    );
    return {
      x: paneRect.left + screenPoint.x,
      y: paneRect.top + screenPoint.y,
    };
  }, point);
}

function getSectionChildren(
  state: ProjectStateResponse,
  sectionId: string,
): string[] {
  const coreChildren = state.sections[sectionId]?.sharedModifier?.children;
  if (coreChildren) {
    return coreChildren;
  }

  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return [];
  }
  const implId = state.sectionVariants[variantId]?.impl;
  if (!implId) {
    return [];
  }

  return state.sectionImpls[implId]?.children ?? [];
}

async function placeSections(
  page: Page,
  projectConfigId: string,
  positionsById: Record<string, { x: number; y: number }>,
): Promise<void> {
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId,
    operations: Object.entries(positionsById).map(([sectionId, position]) => ({
      operationName: "moveSections",
      body: {
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

async function loadLatestProjectState(
  page: Page,
  projectConfigId: string,
): Promise<ProjectStateResponse> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    {
      projectConfigId,
    },
  );

  if (!response?.projectState) {
    throw new Error("Missing latest project state.");
  }
  return response.projectState;
}
