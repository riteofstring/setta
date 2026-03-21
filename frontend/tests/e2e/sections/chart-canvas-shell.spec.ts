import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
} from "../helpers";

type CreateTopLevelSectionResponse = { sectionId?: string };

test("chart canvas shell keeps the flattened wrapper shell", async ({
  page,
}) => {
  await ensureAppReady(page);
  const context = await openIsolatedProject(page);

  try {
    const sectionId = await createChartSection(page, context.projectConfigId);
    const chartSection = findSectionCandidates(
      page,
      "__pw_chart_shell__",
    ).first();
    const chartShell = chartSection.locator("figure.section-row-main").first();
    const canvas = chartShell.locator("canvas").first();

    await expect(chartSection).toBeVisible();
    await expect(chartShell).toHaveCount(1);
    await expect
      .poll(async () => {
        const box = await canvas.boundingBox();
        return Boolean(box && box.width > 0 && box.height > 0);
      })
      .toBe(true);

    const classRead = await chartShell.evaluate((shell) => {
      const canvas = shell.querySelector("canvas");
      return {
        shellClassName: shell.className,
        canvasClassName: canvas instanceof HTMLElement ? canvas.className : "",
        shellMarkup: shell.innerHTML,
      };
    });

    expect(classRead.shellMarkup).not.toContain("single-cell-container");
    expect(classRead.shellMarkup).not.toContain("single-cell-child");
    expect(classRead.shellClassName).not.toContain("single-cell-container");
    expect(classRead.canvasClassName).not.toContain("single-cell-child");

    const shellBox = await chartShell.boundingBox();
    const canvasBox = await canvas.boundingBox();
    expect(shellBox).not.toBeNull();
    expect(canvasBox).not.toBeNull();
    if (!shellBox || !canvasBox) {
      throw new Error("Missing chart canvas geometry.");
    }

    expect(shellBox.width).toBeGreaterThan(0);
    expect(shellBox.height).toBeGreaterThan(0);
    expect(canvasBox.width).toBeGreaterThan(0);
    expect(canvasBox.height).toBeGreaterThan(0);
    expect(canvasBox.width).toBeLessThanOrEqual(shellBox.width + 1);
    expect(canvasBox.height).toBeLessThanOrEqual(shellBox.height + 1);

    await postBackend(page, "/deleteSections", {
      projectConfigId: context.projectConfigId,
      sectionIds: [sectionId],
    });
  } finally {
    await cleanupIsolatedProject(page, context);
  }
});

async function createChartSection(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const created = await postBackend<CreateTopLevelSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Chart",
    },
  );
  const sectionId = created?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating chart section.");
  }
  await postBackend(page, "/setSectionName", {
    projectConfigId,
    sectionId,
    name: "__pw_chart_shell__",
  });
  return sectionId;
}

function findSectionCandidates(page: Page, name: string) {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) });
}
