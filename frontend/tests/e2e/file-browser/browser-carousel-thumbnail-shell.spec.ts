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
const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2p3ioAAAAASUVORK5CYII=";

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
    const candidates = [
      root,
      root.matches(".cm-editor") ? root : root.querySelector(".cm-editor"),
      root.querySelector(".cm-content"),
      root.querySelector("[contenteditable='true']"),
    ].filter(Boolean) as HTMLElement[];

    for (const candidate of candidates) {
      const view = (
        candidate as HTMLElement & {
          cmView?: { state?: { doc?: { toString: () => string } } };
        }
      ).cmView;
      const doc = view?.state?.doc;
      if (doc && typeof doc.toString === "function") {
        return doc.toString();
      }
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
}) {
  const pathInputId = `CodeMirror-${sectionId}-browser-path`;
  const pathInput = sectionNode.locator(`[id="${pathInputId}"]`);
  const cmContent = pathInput.locator(".cm-content");
  await expect(cmContent).toBeVisible();
  await cmContent.click();
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText(targetPath);
  await page.keyboard.press("Enter");

  await expect
    .poll(async () =>
      normalizePathForComparison(await readCodeMirrorValue(page, pathInputId)),
    )
    .toContain(normalizePathForComparison(targetPath));
}

type CarouselThumbnailMetrics = {
  usesSingleCell: boolean;
  previewWidth: number;
  previewHeight: number;
  hasImage: boolean;
  hasSvg: boolean;
  badgeText: string | null;
  checkboxWithinPreview: boolean;
  imageMatchesPreview: boolean;
};

async function readCarouselThumbnailMetrics(
  card: Locator,
): Promise<CarouselThumbnailMetrics> {
  return card.evaluate((element) => {
    const preview =
      element.querySelector("div") instanceof HTMLElement
        ? element.querySelector("div")
        : null;
    const previewRect = preview?.getBoundingClientRect();
    const previewContentWidth = preview?.clientWidth ?? 0;
    const previewContentHeight = preview?.clientHeight ?? 0;
    const image = preview?.querySelector("img");
    const imageRect = image?.getBoundingClientRect();
    const checkbox = preview?.querySelector('input[type="checkbox"]');
    const checkboxRect = checkbox?.getBoundingClientRect();
    const badge = preview?.querySelector("span");
    return {
      usesSingleCell:
        element.outerHTML.includes("single-cell-container") ||
        element.outerHTML.includes("single-cell-child"),
      previewWidth: previewRect?.width ?? 0,
      previewHeight: previewRect?.height ?? 0,
      hasImage: image instanceof HTMLImageElement,
      hasSvg: preview?.querySelector("svg") instanceof SVGElement,
      badgeText: badge?.textContent?.trim() || null,
      checkboxWithinPreview:
        !!previewRect &&
        !!checkboxRect &&
        checkboxRect.left >= previewRect.left &&
        checkboxRect.top >= previewRect.top &&
        checkboxRect.right <= previewRect.right &&
        checkboxRect.bottom <= previewRect.bottom,
      imageMatchesPreview:
        previewContentWidth > 0 &&
        previewContentHeight > 0 &&
        !!imageRect &&
        Math.abs(imageRect.width - previewContentWidth) <= 1 &&
        Math.abs(imageRect.height - previewContentHeight) <= 1,
    };
  });
}

test("carousel thumbnail shells keep the shared wrapper off single-cell helpers", async ({
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
      throw new Error("Unable to resolve viewport bounds for section placement.");
    }

    const browserSection = await postBackend<{ sectionId?: string }>(
      page,
      "/createTopLevelSection",
      {
        projectConfigId,
        implType: "Browser",
        position: {
          x: viewportBounds.x + viewportBounds.w * 0.25,
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
      path.join(workspaceRoot, "setta-browser-carousel-thumbnail-shell-"),
    );
    const imageName = "carousel-shell.png";
    const textName = "carousel-shell.txt";
    const imagePath = path.join(parentDir, imageName);
    const textPath = path.join(parentDir, textName);
    await fs.writeFile(imagePath, Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64"));
    await fs.writeFile(textPath, "carousel shell text");

    try {
      const sectionNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(sectionNode).toBeVisible();

      await sectionNode
        .getByRole("button", { name: "Carousel view", exact: true })
        .click();
      await setBrowserPath({
        page,
        sectionNode,
        sectionId,
        targetPath: parentDir,
      });

      const thumbnailRow = sectionNode
        .locator(".setta-media-carousel-thumbnail-row")
        .first();
      await expect(thumbnailRow).toBeVisible();

      const imageCard = thumbnailRow.getByRole("button", {
        name: imageName,
        exact: true,
      });
      const textCard = thumbnailRow.getByRole("button", {
        name: textName,
        exact: true,
      });

      await expect(imageCard).toBeVisible({ timeout: 15000 });
      await expect(textCard).toBeVisible({ timeout: 15000 });
      // The shared MediaCarousel wrapper should keep the Browser carousel tile
      // geometry and overlays intact while dropping the old single-cell helpers.
      const imageMetrics = await readCarouselThumbnailMetrics(imageCard);
      const textMetrics = await readCarouselThumbnailMetrics(textCard);

      expect(imageMetrics.usesSingleCell).toBe(false);
      expect(textMetrics.usesSingleCell).toBe(false);
      expect(imageMetrics.previewWidth).toBeGreaterThan(90);
      expect(imageMetrics.previewHeight).toBeGreaterThan(90);
      expect(imageMetrics.checkboxWithinPreview).toBe(true);
      expect(textMetrics.hasImage).toBe(false);
      expect(textMetrics.hasSvg).toBe(true);
      expect(textMetrics.badgeText).toBe("TXT");
      expect(textMetrics.checkboxWithinPreview).toBe(true);
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
