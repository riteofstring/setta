import { expect, test, type Page } from "@playwright/test";
import {
  createCallableSection,
  disableCanvasSidePanePointerInterception,
  ensureAppReady,
  getCurrentProjectConfigId,
  getGpuFlowNodeScreenRect,
  postBackend,
} from "../helpers";

test("escape clears active section when focused in section input", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectConfigId = await getCurrentProjectConfigId(page);
  const sectionId = await createCallableSection(page, projectConfigId);
  await disableCanvasSidePanePointerInterception(page);

  try {
    await clearSelectedParams(page, projectConfigId);
    const sectionNode = page.locator(
      `.setta-gpu-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();

    const searchTarget = page.locator(`[id="${sectionId}-search"]`);
    await expect(searchTarget).toBeVisible();
    await clickGpuFlowSectionSearch(page, sectionNode, searchTarget, sectionId);
    await expect
      .poll(async () => await isSectionActive(page, sectionId))
      .toBe(true);
    await focusSectionSearchInput(searchTarget);
    await expect
      .poll(async () => await isFocusedInsideSection(page, sectionId))
      .toBe(true);

    await page.keyboard.press("Escape");

    await expect
      .poll(async () => await isSectionActive(page, sectionId))
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

async function clickGpuFlowSectionSearch(
  page: Page,
  sectionNode: ReturnType<Page["locator"]>,
  searchTarget: ReturnType<Page["locator"]>,
  sectionId: string,
): Promise<void> {
  const nodeBox = await getGpuFlowNodeScreenRect(sectionNode);
  if (!nodeBox) {
    throw new Error(`Unable to resolve GPU flow node bounds for ${sectionId}.`);
  }
  const localPoint = await searchTarget.evaluate((search, sectionId) => {
    const node = document.querySelector(
      `.setta-gpu-flow__node[data-id="${sectionId}"]`,
    );
    if (!(node instanceof HTMLElement)) {
      return null;
    }
    const nodeRect = node.getBoundingClientRect();
    const searchRect = search.getBoundingClientRect();
    return {
      x: searchRect.left - nodeRect.left + searchRect.width / 2,
      y: searchRect.top - nodeRect.top + searchRect.height / 2,
    };
  }, sectionId);
  if (!localPoint) {
    throw new Error(`Unable to resolve search click point for ${sectionId}.`);
  }
  await page.mouse.click(nodeBox.x + localPoint.x, nodeBox.y + localPoint.y);
}

async function focusSectionSearchInput(
  searchTarget: ReturnType<Page["locator"]>,
): Promise<void> {
  await searchTarget.evaluate((target) => {
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const focusTarget =
      target.querySelector<HTMLElement>(
        "input, textarea, [contenteditable='true']",
      ) ?? target;
    focusTarget?.focus();
  });
}

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

async function isSectionActive(
  page: Page,
  sectionId: string,
): Promise<boolean> {
  return page.evaluate((id) => {
    const node = document.querySelector(
      `.setta-gpu-flow__node[data-id="${id}"]`,
    );
    if (!node) {
      return false;
    }
    const section = node.querySelector("section");
    if (!(section instanceof HTMLElement)) {
      return false;
    }
    return section.getAttribute("data-section-active") === "true";
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
    const sectionNode = active.closest(".setta-gpu-flow__node");
    return sectionNode?.getAttribute("data-id") === id;
  }, sectionId);
}
