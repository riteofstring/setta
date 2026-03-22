import { expect, test, type Locator, type Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  cleanupIsolatedProject,
  clearProjectChatWindows,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  refreshProjectStateFromBackend,
} from "../helpers";

const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

function normalizePathForComparison(value: string): string {
  const withoutPrivate = value.startsWith("/private")
    ? value.slice("/private".length)
    : value;
  return withoutPrivate.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

async function dispatchVerticalPointerDrag(
  locator: Locator,
  deltaY: number,
): Promise<void> {
  await locator.evaluate(async (element, dragDeltaY) => {
    const rect = element.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const pointerId = 91;

    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail: 1,
        pointerId,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX,
        clientY: startY,
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 1,
        clientX,
        clientY: startY + dragDeltaY,
      }),
    );
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: 0,
        clientX,
        clientY: startY + dragDeltaY,
      }),
    );
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }, deltaY);
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
    await page.keyboard.type(targetPath);
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

test("carousel thumbnail strip is vertically resizable", async ({ page }) => {
  const workspaceRoot = process.env.SETTA_WORKSPACE_ROOT;
  if (!workspaceRoot) {
    throw new Error("Missing SETTA_WORKSPACE_ROOT for e2e test.");
  }
  const projectContext = await openIsolatedProject(page);
  await clearProjectChatWindows(page);
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
          y: viewportBounds.y + viewportBounds.h * 0.5,
        },
        viewportBounds,
      },
    );
    const sectionId = browserSection?.sectionId;
    if (!sectionId) {
      throw new Error("Missing sectionId when creating browser section.");
    }
    await refreshProjectStateFromBackend(page, projectConfigId);

    const parentDir = await fs.mkdtemp(
      path.join(workspaceRoot, "setta-carousel-resize-"),
    );
    const fileName = "very_long_filename_for_resize_test.txt";
    await fs.writeFile(path.join(parentDir, fileName), "hello\n");

    try {
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

      const expectedTile = sectionNode
        .locator(`button[aria-label="${fileName}"]`)
        .first();
      await expect(expectedTile).toHaveCount(1, { timeout: 30000 });
      await expectedTile.scrollIntoViewIfNeeded();
      await expect(expectedTile).toBeVisible({ timeout: 15000 });

      const resizeHandle = sectionNode.locator(
        '[aria-label="Resize thumbnail strip"]',
      );
      await expect(resizeHandle).toBeVisible();

      const thumbnailRow = resizeHandle
        .locator("xpath=following-sibling::article")
        .first();
      await expect(thumbnailRow.locator("button")).toHaveCount(1, {
        timeout: 15000,
      });
      const firstTile = thumbnailRow.locator("button").first();
      await expect(firstTile).toBeVisible({ timeout: 15000 });

      const initialBox = await firstTile.boundingBox();
      if (!initialBox) {
        throw new Error(
          "Missing bounding box for the first carousel thumbnail.",
        );
      }
      const initialRowHeight = await thumbnailRow.evaluate(
        (element) => element.getBoundingClientRect().height,
      );

      await dispatchVerticalPointerDrag(resizeHandle, 220);

      await expect
        .poll(() =>
          thumbnailRow.evaluate(
            (element) => element.getBoundingClientRect().height,
          ),
        )
        .toBeLessThan(initialRowHeight - 30);
      await expect
        .poll(async () => (await firstTile.boundingBox())?.width ?? 0)
        .toBeLessThan(initialBox.width - 30);

      // In compact mode, the filename is truncated but the extension is preserved
      // as a separate span so it stays visible.
      await expect(
        firstTile.locator("span.shrink-0").filter({ hasText: ".txt" }),
      ).toHaveCount(1);
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
