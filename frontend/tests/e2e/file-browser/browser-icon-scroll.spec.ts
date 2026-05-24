import { expect, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
} from "../helpers";

const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

test("icon view scrolls with trackpad wheel (does not get eaten by canvas pan)", async ({
  page,
}) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }

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
        x: viewportBounds.x + viewportBounds.w * 0.25,
        y: viewportBounds.y + viewportBounds.h * 0.25,
      },
      viewportBounds,
    });
    const sectionId = browserSection?.sectionId;
    if (!sectionId) {
      throw new Error("Missing sectionId when creating browser section.");
    }

    const parentDir = await fs.mkdtemp(
      path.join(workspaceRoot, "setta-browser-icon-scroll-"),
    );

    try {
      // Create enough items to force vertical overflow so icon view must scroll.
      for (let i = 0; i < 220; i += 1) {
        await fs.writeFile(
          path.join(parentDir, `file-${i}.txt`),
          `file ${i}\n`,
        );
      }

      const sectionNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(sectionNode).toBeVisible();

      await sectionNode.locator('button[aria-label="Icon view"]').click();

      const pathInputId = `CodeMirror-${sectionId}-browser-path`;
      const pathInput = sectionNode.locator(`[id="${pathInputId}"]`);
      const cmContent = pathInput.locator(".cm-content");
      await expect(cmContent).toBeVisible();
      await cmContent.click();
      await page.keyboard.press(SELECT_ALL_SHORTCUT);
      await page.keyboard.type(parentDir);
      await page.keyboard.press("Enter");

      const firstTileText = sectionNode.getByText("file-0.txt", {
        exact: true,
      });
      await expect(firstTileText).toBeVisible({ timeout: 15000 });

      // Find the nearest scroll container for the icon grid and ensure it can scroll.
      const scrollContainer = firstTileText.locator(
        "xpath=ancestor::div[contains(@class,'overflow-y-auto')][1]",
      );
      await expect(scrollContainer).toBeVisible();
      await expect
        .poll(() =>
          scrollContainer.evaluate((el) => el.scrollHeight > el.clientHeight),
        )
        .toBe(true);
      // The Browser icon view must opt out of canvas pan/zoom wheel handling once it becomes scrollable.
      await expect
        .poll(() =>
          scrollContainer.evaluate((el) => el.classList.contains("nowheel")),
        )
        .toBe(true);

      const initialScrollTop = await scrollContainer.evaluate(
        (el) => el.scrollTop,
      );
      await scrollContainer.hover();
      const startMs = Date.now();
      await page.mouse.wheel(0, 900);

      // Performance smoke check: scrolling should take effect quickly, even with many tiles.
      await expect
        .poll(() => scrollContainer.evaluate((el) => el.scrollTop), {
          timeout: 1500,
        })
        .toBeGreaterThan(initialScrollTop);
      expect(Date.now() - startMs).toBeLessThan(1500);
    } finally {
      await fs.rm(parentDir, { recursive: true, force: true });
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: [sectionId],
      });
    }
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
