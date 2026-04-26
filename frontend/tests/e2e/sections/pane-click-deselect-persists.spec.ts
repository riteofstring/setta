import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
} from "../helpers";

test("blank-canvas deselect persists after a selection-key click and reload", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const sectionId = await createCallableSection(
      page,
      projectContext.projectConfigId,
    );

    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();

    const sectionChrome = sectionNode
      .locator(`section[data-section-id="${sectionId}"]`)
      .first();
    await expect(sectionChrome).toBeVisible();
    await sectionChrome.dispatchEvent("click");

    const minimapNode = page.locator(`[data-minimap-node-id="${sectionId}"]`);
    await expect(minimapNode).toHaveClass(/selected/);

    const selectionKeyCode = await getSelectionKeyCode(page);
    const blankCanvasPoint = await getBlankCanvasPoint(page);

    await page.keyboard.down(selectionKeyCode);
    await page.mouse.click(blankCanvasPoint.x, blankCanvasPoint.y);
    await page.keyboard.up(selectionKeyCode);

    // The canvas deselect should converge in both the live UI and backend state.
    await expect
      .poll(async () => await isSectionActive(page, sectionId))
      .toBe(false);
    await expect(minimapNode).not.toHaveClass(/selected/);
    await expect.poll(async () => await readBackendActiveIds(page)).toEqual([]);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".canvas-flow__canvas");

    // Reload must preserve the empty selection instead of restoring stale backend state.
    await expect(sectionNode).toBeVisible();
    await expect
      .poll(async () => await isSectionActive(page, sectionId))
      .toBe(false);
    await expect(minimapNode).not.toHaveClass(/selected/);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

async function getSelectionKeyCode(page: Page): Promise<string> {
  return await page.evaluate(async () => {
    const { useSettings } = await import("/src/state/definitions.ts");
    return useSettings.getState().shortcuts.selectionKeyCode;
  });
}

async function getBlankCanvasPoint(
  page: Page,
): Promise<{ x: number; y: number }> {
  return await page.evaluate(() => {
    const pane = document.querySelector(".canvas-flow__canvas");
    if (!(pane instanceof HTMLElement)) {
      throw new Error("Missing canvas pane.");
    }

    const paneRect = pane.getBoundingClientRect();
    const nodeRects = Array.from(
      document.querySelectorAll<HTMLElement>(".react-flow__node"),
    ).map((node) => node.getBoundingClientRect());

    const candidates = [
      { x: paneRect.left + paneRect.width / 2, y: paneRect.bottom - 48 },
      { x: paneRect.left + paneRect.width / 2, y: paneRect.top + 48 },
      { x: paneRect.left + 120, y: paneRect.top + paneRect.height / 2 },
      { x: paneRect.right - 120, y: paneRect.top + paneRect.height / 2 },
    ];

    for (const candidate of candidates) {
      const insideNode = nodeRects.some(
        (rect) =>
          candidate.x >= rect.left &&
          candidate.x <= rect.right &&
          candidate.y >= rect.top &&
          candidate.y <= rect.bottom,
      );
      if (!insideNode) {
        return candidate;
      }
    }

    throw new Error("Unable to find a blank canvas point for deselect.");
  });
}

async function readBackendActiveIds(page: Page): Promise<string[]> {
  const projectConfigName = await page.evaluate(() => {
    return decodeURIComponent(
      window.location.pathname.split("/").filter(Boolean)[0] ?? "",
    );
  });
  if (!projectConfigName) {
    throw new Error("Unable to resolve the current project config name.");
  }

  const projectState = await postBackend<{
    projectConfig?: {
      activeIds?: string[];
    };
  }>(page, "/loadProjectConfig", {
    projectConfigName,
  });
  return projectState?.projectConfig?.activeIds ?? [];
}

async function isSectionActive(
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
    return section.getAttribute("data-section-active") === "true";
  }, sectionId);
}
