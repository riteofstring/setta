import { expect, test, type Locator, type Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  cleanupIsolatedProject,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
} from "../helpers";

const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

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

async function setBrowserPath({
  page,
  sectionNode,
  sectionId,
  targetPath,
}: {
  page: Page;
  sectionNode: Locator;
  sectionId: string;
  targetPath: string;
}): Promise<void> {
  const pathInputId = `CodeMirror-${sectionId}-browser-path`;
  const pathInput = sectionNode.locator(`[id="${pathInputId}"]`);
  await expect(pathInput).toBeVisible();
  const cmContent = pathInput.locator(".cm-content");
  await expect(cmContent).toBeVisible();
  const normalizedTarget = normalizePathForComparison(targetPath);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await cmContent.click();
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(targetPath);
    await page.keyboard.press("Enter");

    const startedAt = Date.now();
    const timeoutMs = 2500;
    while (Date.now() - startedAt < timeoutMs) {
      const committedPath = normalizePathForComparison(
        await readCodeMirrorValue(page, pathInputId),
      );
      if (committedPath === normalizedTarget) {
        return;
      }
      await page.waitForTimeout(50);
    }
  }

  const finalPath = normalizePathForComparison(
    await readCodeMirrorValue(page, pathInputId),
  );
  throw new Error(
    `Browser path did not commit cleanly. Expected "${normalizedTarget}", received "${finalPath}".`,
  );
}

test("carousel thumbnail strip scrolls with trackpad wheel", async ({
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

    const browserSection = await postBackend<{ sectionId?: string }>(
      page,
      "/createTopLevelSection",
      {
        projectConfigId,
        implType: "Browser",
        position: {
          x: viewportBounds.x + viewportBounds.w * 0.55,
          y: viewportBounds.y + viewportBounds.h * 0.25,
        },
        viewportBounds,
      },
    );
    const sectionId = browserSection?.sectionId;
    if (!sectionId) {
      throw new Error("Missing sectionId when creating browser section.");
    }

    const parentDir = await fs.mkdtemp(
      path.join(workspaceRoot, "setta-carousel-scroll-"),
    );

    try {
      for (let i = 0; i < 40; i += 1) {
        await fs.writeFile(
          path.join(parentDir, `file-${i}.txt`),
          `file ${i}\n`,
        );
      }

      const sectionNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(sectionNode).toBeVisible();

      await sectionNode.locator('button[aria-label="Carousel view"]').click();
      await setBrowserPath({
        page,
        sectionNode,
        sectionId,
        targetPath: parentDir,
      });

      const resizeHandle = sectionNode.getByRole("separator", {
        name: "Resize thumbnail strip",
      });
      await expect(resizeHandle).toBeVisible();
      const thumbnailRow = resizeHandle
        .locator("xpath=following-sibling::article")
        .first();
      await expect(thumbnailRow).toBeVisible();
      await expect(thumbnailRow.locator("button")).toHaveCount(40, {
        timeout: 15000,
      });

      await expect
        .poll(() =>
          thumbnailRow.evaluate((el) => el.scrollWidth > el.clientWidth),
        )
        .toBe(true);

      const initialScrollLeft = await thumbnailRow.evaluate(
        (el) => el.scrollLeft,
      );
      await thumbnailRow.hover();
      const startMs = Date.now();
      await page.mouse.wheel(0, 600);

      // Performance smoke check: scrolling should take effect quickly.
      await expect
        .poll(() => thumbnailRow.evaluate((el) => el.scrollLeft), {
          timeout: 1500,
        })
        .toBeGreaterThan(initialScrollLeft);
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
