import { expect, test, type Page } from "@playwright/test";
import {
  createCallableSection,
  ensureAppReady,
  getCurrentProjectConfigId,
  postBackend,
} from "../helpers";

test("escape clears active section when focused in section input", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectConfigId = await getCurrentProjectConfigId(page);
  const sectionId = await createCallableSection(page, projectConfigId);

  try {
    await clearSelectedParams(page, projectConfigId);
    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();

    const sectionCard = sectionNode.locator("section").first();
    await sectionCard.click();
    await expect
      .poll(async () => await isSectionActiveByClass(page, sectionId))
      .toBe(true);

    const searchTarget = page.locator(`[id="${sectionId}-search"]`);
    await expect(searchTarget).toBeVisible();
    await searchTarget.click();
    await expect
      .poll(async () => await isFocusedInsideSection(page, sectionId))
      .toBe(true);

    await page.keyboard.press("Escape");

    await expect
      .poll(async () => await isSectionActiveByClass(page, sectionId))
      .toBe(false);
    await expect
      .poll(async () => await isDocumentFocusNeutral(page))
      .toBe(true);
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [sectionId],
    });
  }
});

async function clearSelectedParams(
  page: Page,
  projectConfigId: string,
): Promise<void> {
  await postBackend(page, "/unselectAllParams", { projectConfigId });
}

async function isDocumentFocusNeutral(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return (
      document.activeElement === document.body ||
      document.activeElement === document.documentElement
    );
  });
}

async function isSectionActiveByClass(
  page: Page,
  sectionId: string,
): Promise<boolean> {
  return page.evaluate((id) => {
    const node = document.querySelector(`.react-flow__node[data-id="${id}"]`);
    if (!node) {
      return false;
    }
    const section = node.querySelector("section");
    if (!(section instanceof HTMLElement)) {
      return false;
    }
    return section.classList.contains("outline-blue-600");
  }, sectionId);
}

async function isFocusedInsideSection(
  page: Page,
  sectionId: string,
): Promise<boolean> {
  return page.evaluate((id) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) {
      return false;
    }
    if (active.id === `${id}-search`) {
      return true;
    }
    const sectionNode = active.closest(".react-flow__node");
    return sectionNode?.getAttribute("data-id") === id;
  }, sectionId);
}
