import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
} from "../helpers";

type CreateTopLevelSectionResponse = { sectionId?: string };

test("draw canvas shell keeps the flattened overlay shell", async ({
  page,
}) => {
  await ensureAppReady(page);
  const context = await openIsolatedProject(page);

  try {
    const sectionId = await createDrawSection(page, context.projectConfigId);
    const drawSection = findSectionCandidates(
      page,
      "__pw_draw_canvas__",
    ).first();
    const canvasShell = drawSection
      .locator("section.section-row-main.section-key-value")
      .first();
    const canvasWrapper = canvasShell.locator(":scope > div").first();
    const canvas = canvasWrapper.locator("canvas").first();

    await expect(drawSection).toBeVisible();
    await expect(canvasShell).toHaveCount(1);
    await expect(canvasWrapper).toHaveCount(1);
    await expect
      .poll(async () => {
        const box = await canvas.boundingBox();
        return Boolean(box && box.width > 0 && box.height > 0);
      })
      .toBe(true);

    const classRead = await canvasShell.evaluate((shell) => {
      const wrapper = shell.firstElementChild;
      const canvas = wrapper?.querySelector("canvas");
      return {
        shellClassName: shell.className,
        wrapperClassName:
          wrapper instanceof HTMLElement ? wrapper.className : "",
        canvasClassName: canvas instanceof HTMLElement ? canvas.className : "",
        shellMarkup: shell.innerHTML,
      };
    });

    expect(classRead.shellMarkup).not.toContain("single-cell-container");
    expect(classRead.shellMarkup).not.toContain("single-cell-child");
    expect(classRead.shellClassName).not.toContain("single-cell-container");
    expect(classRead.wrapperClassName).not.toContain("single-cell-container");
    expect(classRead.wrapperClassName).not.toContain("single-cell-child");
    expect(classRead.canvasClassName).not.toContain("single-cell-child");

    const shellBox = await canvasShell.boundingBox();
    const wrapperBox = await canvasWrapper.boundingBox();
    const canvasBox = await canvas.boundingBox();
    expect(shellBox).not.toBeNull();
    expect(wrapperBox).not.toBeNull();
    expect(canvasBox).not.toBeNull();
    if (!shellBox || !wrapperBox || !canvasBox) {
      throw new Error("Missing draw canvas geometry.");
    }
    expect(shellBox.width).toBeGreaterThan(0);
    expect(wrapperBox.width).toBeGreaterThan(0);
    expect(wrapperBox.height).toBeGreaterThan(0);
    expect(wrapperBox.width).toBeLessThanOrEqual(shellBox.width + 1);
    expect(canvasBox.width).toBeGreaterThan(0);
    expect(canvasBox.height).toBeGreaterThan(0);
    expect(Math.abs(canvasBox.width - wrapperBox.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(canvasBox.height - wrapperBox.height)).toBeLessThanOrEqual(
      1,
    );

    await postBackend(page, "/deleteSections", {
      projectConfigId: context.projectConfigId,
      sectionIds: [sectionId],
    });
  } finally {
    await cleanupIsolatedProject(page, context);
  }
});

async function createDrawSection(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const created = await postBackend<CreateTopLevelSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Draw",
    },
  );
  const sectionId = created?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating draw section.");
  }
  await postBackend(page, "/setSectionName", {
    projectConfigId,
    sectionId,
    name: "__pw_draw_canvas__",
  });
  return sectionId;
}

function findSectionCandidates(page: Page, name: string) {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) });
}
