import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
} from "../helpers";

type TopLevelSectionLayout = { x: number; y: number; zIndex?: number };
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

    await placeSections(page, projectContext.projectConfigId, {
      [groupId]: { x: 280, y: 80 },
      [childAId]: { x: 40, y: 80 },
      [childBId]: { x: 40, y: 260 },
    });

    await postBackend(page, "/moveSections", {
      projectConfigId: projectContext.projectConfigId,
      sectionIds: [childAId],
      newParentId: groupId,
      newIndex: 0,
      positionsById: null,
    });
    await postBackend(page, "/moveSections", {
      projectConfigId: projectContext.projectConfigId,
      sectionIds: [childBId],
      newParentId: groupId,
      newIndex: 1,
      positionsById: null,
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

    await dragSectionToPane(page, childAId, async () => {
      const state = await loadLatestProjectState(
        page,
        projectContext.projectConfigId,
      );
      return (
        state.parentSectionMap[childAId] === null &&
        Boolean(state.projectConfig.topLevelSections[childAId])
      );
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
        parentA: null,
        parentB: groupId,
        hasA: false,
        hasB: true,
      });
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
  const source = page
    .locator(`section[data-section-id="${sectionId}"]`)
    .first();
  const target = page
    .locator(`section[data-section-id="${targetSectionId}"]`)
    .first();

  await expect(source).toBeVisible();
  await expect(target).toBeVisible();

  await dragWithRetries(
    page,
    async (attempt) => {
      const targetBox = await target.boundingBox();
      if (!targetBox) {
        throw new Error("Missing target box for reorder drag.");
      }

      await performMovingFreeDrag(page, source, {
        x: targetBox.x + targetBox.width * 0.5,
        y: targetBox.y + Math.max(6, targetBox.height * 0.2) + attempt * 2,
      });
    },
    isDone,
    "Failed to reorder nested section via UI drag.",
  );
}

async function dragSectionToPane(
  page: Page,
  sectionId: string,
  isDone: () => Promise<boolean>,
): Promise<void> {
  const source = page
    .locator(`section[data-section-id="${sectionId}"]`)
    .first();
  const pane = page.locator(".react-flow__pane").first();

  await expect(source).toBeVisible();
  await expect(pane).toBeVisible();

  await dragWithRetries(
    page,
    async (attempt) => {
      const paneBox = await pane.boundingBox();
      if (!paneBox) {
        throw new Error("Missing pane box for detaching drag.");
      }

      await performMovingFreeDrag(page, source, {
        x: paneBox.x + paneBox.width - 100 - attempt * 12,
        y: paneBox.y + 80 + attempt * 16,
      });
    },
    isDone,
    "Failed to drag section back to pane via UI.",
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
    await focusPaneForDnd(page);
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
  source: Locator,
  target: { x: number; y: number },
): Promise<void> {
  const headerHandle = source.locator("header.section-title").first();
  const sourceBox =
    (await headerHandle.boundingBox()) ?? (await source.boundingBox());
  if (!sourceBox) {
    throw new Error("Missing source box for drag.");
  }

  const start = getDragStartPoint(sourceBox);

  await page.keyboard.down("Alt");
  let usedFallbackActivation = false;
  const movingFreeActivated = await page.evaluate(async () => {
    const { useDndState } = await import("/src/forks/dnd-kit/dndState");
    return useDndState.getState().isMovingFree;
  });
  if (!movingFreeActivated) {
    usedFallbackActivation = true;
    await page.evaluate(async () => {
      const { activateDndMovingFreeMode } = await import(
        "/src/forks/dnd-kit/dndState"
      );
      activateDndMovingFreeMode();
    });
  }
  try {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.mouse.move(target.x, target.y, { steps: 14 });
    await page.mouse.up();
  } finally {
    await page.keyboard.up("Alt");
    if (usedFallbackActivation) {
      await page.evaluate(async () => {
        const { forceDeactivateDnd } = await import(
          "/src/forks/dnd-kit/dndState"
        );
        forceDeactivateDnd();
      });
    }
  }
}

async function focusPaneForDnd(page: Page): Promise<void> {
  await page.click(".react-flow__pane", {
    position: { x: 8, y: 8 },
    force: true,
    timeout: 10000,
  });
}

function getDragStartPoint(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number } {
  const offset = 12;
  return {
    x: box.x + Math.min(offset, box.width / 2),
    y: box.y + Math.min(offset, box.height / 2),
  };
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
  for (const [sectionId, position] of Object.entries(positionsById)) {
    await postBackend(page, "/moveSections", {
      projectConfigId,
      sectionIds: [sectionId],
      newParentId: null,
      newIndex: null,
      positionsById: {
        [sectionId]: position,
      },
    });
  }
}

async function createTopLevelSection(
  page: Page,
  projectConfigId: string,
  implType: ImplType,
): Promise<string> {
  const response = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType,
    },
  );

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
