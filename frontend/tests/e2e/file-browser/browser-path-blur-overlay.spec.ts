import { type Page, expect, test } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
} from "../helpers";

function normalizePathForComparison(value: string): string {
  const withoutPrivate = value.startsWith("/private")
    ? value.slice("/private".length)
    : value;
  return withoutPrivate.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

async function readCodeMirrorValue(page: Page, id: string): Promise<string> {
  const value = await page.evaluate((targetId) => {
    const root = document.getElementById(targetId);
    if (!root) {
      return null;
    }
    const content =
      root.querySelector(".cm-content") ?? root.querySelector(".cm-line");
    return content?.textContent ?? root.textContent ?? "";
  }, id);
  return value ?? "";
}

async function readBrowserPathOverlayOpacity(
  page: Page,
  pathInputId: string,
): Promise<number | null> {
  const value = await page.evaluate((targetId) => {
    const root = document.getElementById(targetId);
    const search = root?.closest("search");
    const overlay = search?.querySelector(
      'div[aria-hidden="true"]',
    ) as HTMLElement | null;
    if (!overlay) {
      return null;
    }
    return Number.parseFloat(getComputedStyle(overlay).opacity);
  }, pathInputId);
  return value ?? null;
}

test("browser path overlay snaps visible on blur (no blank flash)", async ({
  page,
}) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }
  const normalizedWorkspaceRoot = normalizePathForComparison(workspaceRoot);
  const projectContext = await openIsolatedProject(page);
  try {
    const projectConfigId = projectContext.projectConfigId;
    const viewportBounds = await getViewportBoundsForPlacement(page);
    if (!viewportBounds) {
      throw new Error(
        "Unable to resolve viewport bounds for section placement.",
      );
    }

    const browserSection = await createTopLevelSectionFromFrontend(page, {
      projectConfigId,
      implType: "Browser",
      position: {
        x: viewportBounds.x + viewportBounds.w * 0.5,
        y: viewportBounds.y + viewportBounds.h * 0.22,
      },
      viewportBounds,
    });
    const sectionId = browserSection?.sectionId;
    if (!sectionId) {
      throw new Error("Missing sectionId when creating browser section.");
    }

    try {
      const sectionNode = page.locator(
        `.setta-gpu-flow__node[data-id="${sectionId}"]`,
      );
      await expect(sectionNode).toBeVisible();

      const pathInputId = `CodeMirror-${sectionId}-browser-path`;
      const pathInput = sectionNode.locator(`[id="${pathInputId}"]`);
      await expect(pathInput).toBeVisible();
      await expect
        .poll(() => readCodeMirrorValue(page, pathInputId))
        .toContain(normalizedWorkspaceRoot);

      const cmContent = pathInput.locator(".cm-content");
      await expect(cmContent).toBeVisible();
      await cmContent.click();

      await expect
        .poll(
          async () =>
            (await readBrowserPathOverlayOpacity(page, pathInputId)) ?? 1,
        )
        .toBeLessThanOrEqual(0.01);

      const filterRoot = sectionNode
        .locator('[id^="CodeMirror-FileBrowserFilter-"]')
        .first();
      await expect(filterRoot).toBeVisible();
      await filterRoot.locator(".cm-content").click();

      const blurSnapshot = await page.evaluate(async (targetId) => {
        const root = document.getElementById(targetId);
        const search = root?.closest("search");
        const overlay = search?.querySelector(
          'div[aria-hidden="true"]',
        ) as HTMLElement | null;
        const overlaySpan = overlay?.querySelector("span") ?? null;

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });

        return {
          opacity: overlay ? getComputedStyle(overlay).opacity : null,
          text: overlaySpan?.textContent ?? "",
        };
      }, pathInputId);

      if (!blurSnapshot || blurSnapshot.opacity === null) {
        throw new Error("Unable to read browser path overlay after blur.");
      }

      expect(Number.parseFloat(blurSnapshot.opacity)).toBeGreaterThanOrEqual(
        0.99,
      );
      expect(normalizePathForComparison(blurSnapshot.text)).toContain(
        normalizedWorkspaceRoot,
      );
    } finally {
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
    }
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
