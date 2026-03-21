import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
} from "../helpers";

type CreateTopLevelSectionResponse = { sectionId?: string };

test("draw toolbar color picker keeps the flattened wrapper shell", async ({
  page,
}) => {
  await ensureAppReady(page);
  const context = await openIsolatedProject(page);

  try {
    const sectionId = await createDrawSection(page, context.projectConfigId);
    const drawSection = findSectionCandidates(
      page,
      "__pw_draw_color__",
    ).first();
    const toolbar = drawSection.locator(".section-search").first();
    const colorWrapper = drawSection.locator(".section-search > div").first();
    const colorTrigger = colorWrapper
      .locator(".colorpicker, input[type='color']")
      .first();

    await expect(drawSection).toBeVisible();
    await expect(toolbar).toBeVisible();
    await expect(colorWrapper).toBeVisible();
    await expect(colorTrigger).toBeVisible();

    const colorClassRead = await colorWrapper.evaluate((wrapper) => {
      const control = wrapper.querySelector(
        ".colorpicker, input[type='color']",
      );
      return {
        wrapperClassName: wrapper.className,
        controlClassName:
          control instanceof HTMLElement ? control.className : null,
        wrapperMarkup: wrapper.innerHTML,
      };
    });

    expect(colorClassRead.wrapperMarkup).not.toContain("single-cell-container");
    expect(colorClassRead.wrapperMarkup).not.toContain("single-cell-child");
    expect(colorClassRead.wrapperClassName).not.toContain(
      "single-cell-container",
    );
    expect(colorClassRead.controlClassName).not.toContain(
      "single-cell-container",
    );
    expect(colorClassRead.controlClassName).not.toContain("single-cell-child");

    const toolbarBox = await toolbar.boundingBox();
    const controlBox = await colorTrigger.boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(controlBox).not.toBeNull();
    if (!toolbarBox || !controlBox) {
      throw new Error("Missing draw toolbar geometry for color picker.");
    }
    expect(controlBox.x).toBeGreaterThanOrEqual(toolbarBox.x - 1);
    expect(controlBox.y).toBeGreaterThanOrEqual(toolbarBox.y - 1);
    expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(
      toolbarBox.x + toolbarBox.width + 1,
    );
    expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(
      toolbarBox.y + toolbarBox.height + 1,
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
    name: "__pw_draw_color__",
  });
  return sectionId;
}

function findSectionCandidates(page: Page, name: string) {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) });
}
