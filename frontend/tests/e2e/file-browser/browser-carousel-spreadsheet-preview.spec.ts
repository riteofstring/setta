import { expect, test, type Locator, type Page } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  cleanupIsolatedProject,
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

async function ensureCarouselView(sectionNode: Locator): Promise<void> {
  const carouselButton = sectionNode.locator(
    'button[aria-label="Carousel view"]',
  );
  await expect(carouselButton).toBeVisible();
  await carouselButton.click();
  await expect(
    sectionNode.locator(".setta-media-carousel-thumbnail-row").first(),
  ).toBeVisible();
}

test("browser carousel previews and edits csv/xlsx spreadsheets", async ({
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
          x: viewportBounds.x + viewportBounds.w * 0.45,
          y: viewportBounds.y + viewportBounds.h * 0.42,
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
      path.join(workspaceRoot, "setta-carousel-spreadsheet-"),
    );

    try {
      const csvPath = path.join(parentDir, "sheet.csv");
      await fs.writeFile(csvPath, "task,status\nalpha,todo\n", "utf-8");

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        ["Task", "Owner"],
        ["Beta", "Dev"],
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      const secondaryWorksheet = XLSX.utils.aoa_to_sheet([
        ["Task", "Owner"],
        ["Gamma", "Ops"],
      ]);
      XLSX.utils.book_append_sheet(workbook, secondaryWorksheet, "Archive");
      const xlsxBytes = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      }) as Buffer;
      const xlsxPath = path.join(parentDir, "sheet.xlsx");
      await fs.writeFile(xlsxPath, xlsxBytes);
      const stableMtime = new Date(1000);
      await fs.utimes(csvPath, stableMtime, stableMtime);
      await fs.utimes(xlsxPath, stableMtime, stableMtime);

      const sectionNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(sectionNode).toBeVisible();
      await ensureCarouselView(sectionNode);
      await setBrowserPath({
        page,
        sectionNode,
        sectionId,
        targetPath: parentDir,
      });
      const thumbnailRow = sectionNode
        .locator(".setta-media-carousel-thumbnail-row")
        .first();
      await expect(
        thumbnailRow.locator("button[data-media-carousel-item-id]"),
      ).toHaveCount(2, {
        timeout: 15000,
      });
      const resizeHandle = sectionNode.locator(
        '[role="separator"][aria-label="Resize thumbnail strip"]',
      );
      await expect(resizeHandle).toBeVisible({ timeout: 15000 });

      await thumbnailRow.locator("button", { hasText: "sheet.csv" }).click();
      const gridScroll = sectionNode.getByTestId("spreadsheet-grid-scroll");
      await expect(gridScroll).toBeVisible();
      const scrollbarGutter = await gridScroll.evaluate(
        (node) => getComputedStyle(node).scrollbarGutter,
      );
      expect(scrollbarGutter).toContain("stable");

      const csvLeftCell = sectionNode.locator('[data-spreadsheet-cell="1:0"]');
      const csvCell = sectionNode.locator('[data-spreadsheet-cell="1:1"]');
      await expect(csvLeftCell).toBeVisible();
      await expect(csvCell).toBeVisible();
      const saveButton = sectionNode.getByTestId("spreadsheet-save");
      await expect(saveButton).toBeDisabled();

      await csvCell.fill("todo");
      await expect(sectionNode.getByText("Unsaved edits.")).toHaveCount(0);
      await expect(saveButton).toBeDisabled();

      const leftCellClasses = await csvLeftCell.getAttribute("class");
      expect(leftCellClasses ?? "").toContain("box-border");
      expect(leftCellClasses ?? "").toContain("dark:focus:bg-blue-900/30");
      const rowLayoutMetrics = await page.evaluate(() => {
        const leftCell = document.querySelector(
          '[data-spreadsheet-cell="1:0"]',
        );
        const rightCell = document.querySelector(
          '[data-spreadsheet-cell="1:1"]',
        );
        if (!(leftCell instanceof HTMLInputElement)) {
          return null;
        }
        if (!(rightCell instanceof HTMLInputElement)) {
          return null;
        }
        const leftRect = leftCell.getBoundingClientRect();
        const rightRect = rightCell.getBoundingClientRect();
        return {
          overlapPx: leftRect.right - rightRect.left,
          rowHeightPx: leftRect.height,
          colWidthPx: leftRect.width,
          paddingLeftPx: Number.parseFloat(
            getComputedStyle(leftCell).paddingLeft,
          ),
          fontSizePx: Number.parseFloat(getComputedStyle(leftCell).fontSize),
          boxSizing: getComputedStyle(leftCell).boxSizing,
        };
      });
      if (!rowLayoutMetrics) {
        throw new Error("Failed to read spreadsheet row metrics.");
      }
      expect(rowLayoutMetrics.overlapPx).toBeLessThanOrEqual(0.5);
      expect(rowLayoutMetrics.rowHeightPx).toBeLessThanOrEqual(24);
      expect(rowLayoutMetrics.colWidthPx).toBeLessThanOrEqual(95);
      expect(rowLayoutMetrics.paddingLeftPx).toBeLessThanOrEqual(8);
      expect(rowLayoutMetrics.fontSizePx).toBeLessThanOrEqual(11);
      expect(rowLayoutMetrics.boxSizing).toBe("border-box");
      await csvCell.fill("done");
      await expect(saveButton).toBeEnabled();
      await expect(sectionNode.getByText("Unsaved edits.")).toBeVisible();

      await thumbnailRow.locator("button", { hasText: "sheet.xlsx" }).click();
      const xlsxCell = sectionNode.locator('[data-spreadsheet-cell="1:0"]');
      await expect(xlsxCell).toBeVisible();
      await expect(xlsxCell).toHaveValue("Beta");
      const xlsxOwnerCell = sectionNode.locator(
        '[data-spreadsheet-cell="1:1"]',
      );
      await expect(xlsxOwnerCell).toBeVisible();
      await xlsxOwnerCell.fill("QA");
      await expect(saveButton).toBeEnabled();
      await saveButton.click();
      await expect(sectionNode.getByText("Saved.")).toBeVisible();

      const savedWorkbook = XLSX.read(await fs.readFile(xlsxPath), {
        type: "buffer",
        dense: true,
        raw: false,
      });
      expect(savedWorkbook.SheetNames).toEqual(["Sheet1", "Archive"]);
      const archiveRows = XLSX.utils.sheet_to_json(
        savedWorkbook.Sheets.Archive,
        {
          header: 1,
          raw: false,
          defval: "",
        },
      ) as string[][];
      expect(archiveRows[1]).toEqual(["Gamma", "Ops"]);
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
