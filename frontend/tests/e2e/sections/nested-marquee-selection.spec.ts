import { expect, test, type Page } from "@playwright/test";
import {
  applyProjectMutationsFromFrontend,
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  moveSectionsFromFrontend,
  openIsolatedProject,
} from "../helpers";

type ImplType = "Group" | "Code";

test("marquee selection includes nested group children", async ({ page }) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

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
      [groupId]: { x: 420, y: 120 },
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

    const pane = page.locator(".react-flow__pane").first();
    const childSection = page
      .locator(`section[data-section-id="${childId}"]`)
      .first();

    await expect(pane).toBeVisible();
    await expect(childSection).toBeVisible();

    const paneBox = await pane.boundingBox();
    const childBox = await childSection.boundingBox();
    if (!paneBox || !childBox) {
      throw new Error("Missing bounds for nested marquee selection test.");
    }

    // Start on empty pane space just left of the nested child so the pane owns
    // the drag gesture, then sweep a box that fully covers the child only.
    const startX = Math.max(paneBox.x + 16, childBox.x - 56);
    const startY = Math.max(paneBox.y + 16, childBox.y - 12);
    const endX = Math.min(
      paneBox.x + paneBox.width - 16,
      childBox.x + childBox.width + 12,
    );
    const endY = Math.min(
      paneBox.y + paneBox.height - 16,
      childBox.y + childBox.height + 12,
    );

    // Hold the selection modifier so the pane uses marquee selection.
    await page.keyboard.down("Shift");
    try {
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY, { steps: 16 });
      await page.mouse.up();
    } finally {
      await page.keyboard.up("Shift");
    }

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

  try {
    const sectionId = await createTopLevelSection(
      page,
      projectContext.projectConfigId,
      "Code",
    );
    await placeSections(page, projectContext.projectConfigId, {
      [sectionId]: { x: 80, y: 120 },
    });

    const pane = page.locator(".react-flow__pane").first();
    const section = page
      .locator(`section[data-section-id="${sectionId}"]`)
      .first();

    await expect(pane).toBeVisible();
    await expect(section).toBeVisible();
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

    await page.keyboard.down("Shift");
    try {
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY, { steps: 12 });
      await page.mouse.up();
    } finally {
      await page.keyboard.up("Shift");
    }

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

  try {
    const sectionId = await createTopLevelSection(
      page,
      projectContext.projectConfigId,
      "Code",
    );
    await placeSections(page, projectContext.projectConfigId, {
      [sectionId]: { x: 80, y: 120 },
    });

    const pane = page.locator(".react-flow__pane").first();
    const section = page
      .locator(`section[data-section-id="${sectionId}"]`)
      .first();

    await expect(pane).toBeVisible();
    await expect(section).toBeVisible();
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

    await page.keyboard.down("Shift");
    try {
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(endX, endY, { steps: 12 });
      await page.mouse.up();
    } finally {
      await page.keyboard.up("Shift");
    }

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
