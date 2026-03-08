import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
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
    await postBackend(page, "/moveSections", {
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

async function readFrontendActiveIds(page: Page): Promise<string[]> {
  return await page.evaluate(async () => {
    const { useActiveSectionUI } = await import(
      "/src/state/activeSectionUI.ts"
    );
    return [...useActiveSectionUI.getState().activeIds];
  });
}
