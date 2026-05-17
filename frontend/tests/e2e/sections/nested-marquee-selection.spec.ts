import { expect, test, type Page } from "@playwright/test";
import {
  applyProjectMutationsFromFrontend,
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  disableCanvasSidePanePointerInterception,
  ensureAppReady,
  moveSectionsFromFrontend,
  openIsolatedProject,
} from "../helpers";

type ImplType = "Group" | "Code";

test("marquee selection includes nested group children", async ({ page }) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  await disableCanvasSidePanePointerInterception(page);

  try {
    const groupId = await createTopLevelSection(
      page,
      projectContext.projectConfigId,
      "Group",
    );
    const childId = await createTopLevelSection(
      page,
      projectContext.projectConfigId,
      "Code",
    );

    await placeSections(page, projectContext.projectConfigId, {
      [groupId]: { x: 120, y: 120 },
      [childId]: { x: 80, y: 120 },
    });
    await moveSectionsFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionIds: [childId],
      newParentId: groupId,
      newIndex: 0,
      positionsById: null,
    });

    await expect
      .poll(async () => {
        return await readFrontendActiveIds(page);
      })
      .toEqual([]);

    const pane = page.locator(".setta-gpu-flow__pane").first();

    await expect(pane).toBeVisible();
    await waitForGpuFlowNodeScreenRect(page, groupId);
    const childBox = await waitForGpuFlowNodeScreenRect(page, childId);

    const paneBox = await pane.boundingBox();
    if (!paneBox) {
      throw new Error("Missing bounds for nested marquee selection test.");
    }

    // Start on empty pane space so the pane owns the drag gesture, then sweep
    // a box that fully covers the nested child.
    const startX = paneBox.x + 16;
    const startY = Math.max(paneBox.y + 16, childBox.y - 24);
    const endX = Math.min(
      paneBox.x + paneBox.width - 16,
      childBox.x + childBox.width + 12,
    );
    const endY = Math.min(
      paneBox.y + paneBox.height - 16,
      childBox.y + childBox.height + 12,
    );

    await dragSelectionBox(page, { endX, endY, startX, startY, steps: 16 });

    await expect
      .poll(async () => {
        return await readFrontendActiveIds(page);
      })
      .toContain(childId);

    const activeIds = await readFrontendActiveIds(page);
    expect(activeIds).toContain(childId);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("marquee selection ignores far-away unmeasured top-level nodes when DOM bounds do not overlap", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  await disableCanvasSidePanePointerInterception(page);

  try {
    const sectionId = await createTopLevelSection(
      page,
      projectContext.projectConfigId,
      "Code",
    );
    await placeSections(page, projectContext.projectConfigId, {
      [sectionId]: { x: 80, y: 120 },
    });

    const pane = page.locator(".setta-gpu-flow__pane").first();

    await expect(pane).toBeVisible();
    await waitForGpuFlowNodeScreenRect(page, sectionId);
    await expect.poll(async () => readFrontendActiveIds(page)).toEqual([]);

    await page.evaluate(async (targetSectionId) => {
      const { useNodeInternals } = await import("/src/state/definitions.ts");
      const currentNodes = useNodeInternals.getState().x;
      const nextNodes = new Map(currentNodes);
      const targetNode = nextNodes.get(targetSectionId);
      if (!targetNode) {
        throw new Error(`Missing node internals for ${targetSectionId}.`);
      }
      nextNodes.set(targetSectionId, {
        ...targetNode,
        width: null,
        height: null,
      });
      useNodeInternals.setState({ x: nextNodes });
    }, sectionId);

    const paneBox = await pane.boundingBox();
    if (!paneBox) {
      throw new Error("Missing pane bounds for unmeasured marquee test.");
    }

    const startX = paneBox.x + paneBox.width - 140;
    const startY = paneBox.y + paneBox.height - 120;
    const endX = paneBox.x + paneBox.width - 32;
    const endY = paneBox.y + paneBox.height - 32;

    await dragSelectionBox(page, { endX, endY, startX, startY, steps: 12 });

    await expect.poll(async () => readFrontendActiveIds(page)).toEqual([]);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("marquee selection ignores zero-width node internals when DOM bounds do not overlap", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  await disableCanvasSidePanePointerInterception(page);

  try {
    const sectionId = await createTopLevelSection(
      page,
      projectContext.projectConfigId,
      "Code",
    );
    await placeSections(page, projectContext.projectConfigId, {
      [sectionId]: { x: 80, y: 120 },
    });

    const pane = page.locator(".setta-gpu-flow__pane").first();

    await expect(pane).toBeVisible();
    await waitForGpuFlowNodeScreenRect(page, sectionId);
    await expect.poll(async () => readFrontendActiveIds(page)).toEqual([]);

    await page.evaluate(async (targetSectionId) => {
      const { useNodeInternals } = await import("/src/state/definitions.ts");
      const currentNodes = useNodeInternals.getState().x;
      const nextNodes = new Map(currentNodes);
      const targetNode = nextNodes.get(targetSectionId);
      if (!targetNode) {
        throw new Error(`Missing node internals for ${targetSectionId}.`);
      }
      nextNodes.set(targetSectionId, {
        ...targetNode,
        width: 0,
        height: 40,
      });
      useNodeInternals.setState({ x: nextNodes });
    }, sectionId);

    const paneBox = await pane.boundingBox();
    if (!paneBox) {
      throw new Error("Missing pane bounds for zero-width marquee test.");
    }

    const startX = paneBox.x + paneBox.width - 140;
    const startY = paneBox.y + paneBox.height - 120;
    const endX = paneBox.x + paneBox.width - 32;
    const endY = paneBox.y + paneBox.height - 32;

    await dragSelectionBox(page, { endX, endY, startX, startY, steps: 12 });

    await expect.poll(async () => readFrontendActiveIds(page)).toEqual([]);
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

async function readFrontendActiveIds(page: Page): Promise<string[]> {
  return await page.evaluate(async () => {
    const { useActiveSectionUI } = await import(
      "/src/state/activeSectionUI.ts"
    );
    return [...useActiveSectionUI.getState().activeIds];
  });
}

type GpuFlowNodeScreenRect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

async function readGpuFlowNodeScreenRect(
  page: Page,
  nodeId: string,
): Promise<GpuFlowNodeScreenRect | null> {
  return await page.evaluate((nodeId) => {
    return (
      (
        window as typeof window & {
          __settaGpuFlowNodeScreenRect?: (
            nodeId: string,
          ) => GpuFlowNodeScreenRect | null;
        }
      ).__settaGpuFlowNodeScreenRect?.(nodeId) ?? null
    );
  }, nodeId);
}

async function waitForGpuFlowNodeScreenRect(
  page: Page,
  nodeId: string,
): Promise<GpuFlowNodeScreenRect> {
  await expect
    .poll(async () => {
      const rect = await readGpuFlowNodeScreenRect(page, nodeId);
      return rect === null || rect.width <= 0 || rect.height <= 0
        ? null
        : {
            height: Math.round(rect.height),
            width: Math.round(rect.width),
            x: Math.round(rect.x),
            y: Math.round(rect.y),
          };
    })
    .not.toBeNull();

  const rect = await readGpuFlowNodeScreenRect(page, nodeId);
  if (rect === null || rect.width <= 0 || rect.height <= 0) {
    throw new Error(`Missing GPU flow node screen rect for ${nodeId}.`);
  }
  return rect;
}

async function dragSelectionBox(
  page: Page,
  input: {
    readonly endX: number;
    readonly endY: number;
    readonly startX: number;
    readonly startY: number;
    readonly steps: number;
  },
): Promise<void> {
  await setGpuFlowSelectionKeyPressed(page, true);
  try {
    await page.mouse.move(input.startX, input.startY);
    await page.mouse.down();
    await page.mouse.move(input.endX, input.endY, { steps: input.steps });
    await page.mouse.up();
  } finally {
    await setGpuFlowSelectionKeyPressed(page, false);
  }
}

async function setGpuFlowSelectionKeyPressed(
  page: Page,
  pressed: boolean,
): Promise<void> {
  await page.evaluate(async (pressed) => {
    const { activateSelectionKeyPressed, deactivateSelectionKeyPressed } =
      await import("/src/state/actions/keyActivations/tabAndModeActions.ts");
    if (pressed) {
      activateSelectionKeyPressed();
    } else {
      deactivateSelectionKeyPressed();
    }
  }, pressed);
}
