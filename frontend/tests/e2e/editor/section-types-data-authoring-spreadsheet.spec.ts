import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import * as XLSX from "xlsx";
import {
  cleanupIsolatedProject,
  clearProjectChatWindows,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";
import {
  applyZoomPreset,
  createTopLevelSection,
  dragBrowserRowToTarget,
  getExpectedSpreadsheetDensityMultiplier,
  getSpreadsheetCanvasDensityMetrics,
  type RootResponse,
} from "./section-types-data-authoring-helpers";

test.describe.serial("section types data authoring", () => {
  test("spreadsheet filter and sort controls render correctly in dark mode", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: false,
      colorMode: "dark",
      darkMode: true,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    await clearProjectChatWindows(page);

    try {
      const root = await postBackend<RootResponse>(
        page,
        "/getFileBrowserRoot",
        null,
      );
      const rootPath = root?.rootPath;
      if (!rootPath) {
        throw new Error("Missing file browser root path.");
      }
      const csvPath = `${rootPath}/pw-dark-sheet.csv`;
      await fs.writeFile(
        csvPath,
        "task,status\nalpha,todo\nbeta,done\n",
        "utf-8",
      );

      const spreadsheetSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Spreadsheet",
      );
      const browserSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Browser",
      );

      const spreadsheetNode = page.locator(
        `.setta-gpu-flow__node[data-id="${spreadsheetSectionId}"]`,
      );
      const browserNode = page.locator(
        `.setta-gpu-flow__node[data-id="${browserSectionId}"]`,
      );
      await expect(spreadsheetNode).toBeVisible();
      await expect(browserNode).toBeVisible();

      const browserExplorer = browserNode
        .locator('[role="region"][aria-label="File explorer"]')
        .first();
      await expect(browserExplorer).toBeVisible();
      const csvRow = browserExplorer
        .locator("button")
        .filter({ hasText: "pw-dark-sheet.csv" })
        .first();
      await expect(csvRow).toBeVisible({ timeout: 15000 });
      await dragBrowserRowToTarget(
        csvRow,
        spreadsheetNode.locator(".section-main").first(),
      );

      const filterInput = spreadsheetNode.getByTestId(
        "spreadsheet-filter-input",
      );
      await expect(filterInput).toBeVisible();
      const sortColumn = spreadsheetNode.getByTestId("spreadsheet-sort-column");
      await expect(sortColumn).toBeVisible();
      const pageIsDark = await page.evaluate(() =>
        document.documentElement.classList.contains("dark"),
      );
      expect(pageIsDark).toBe(true);

      const filterStyles = await filterInput.evaluate((element) => {
        const styles = window.getComputedStyle(element);
        return {
          backgroundColor: styles.backgroundColor,
          color: styles.color,
          borderColor: styles.borderColor,
        };
      });
      expect(filterStyles.backgroundColor).not.toBe("rgb(255, 255, 255)");
      expect(filterStyles.color).not.toBe("rgb(0, 0, 0)");
      expect(filterStyles.borderColor).not.toBe("rgb(0, 0, 0)");

      const glideBgCell = await spreadsheetNode
        .getByTestId("spreadsheet-glide-grid")
        .evaluate((element) => {
          const themedElement =
            element.querySelector<HTMLElement>('[style*="--gdg-bg-cell"]') ??
            (element.firstElementChild as HTMLElement | null);
          if (!themedElement) {
            return "";
          }
          const computed = window.getComputedStyle(themedElement);
          return (
            computed.getPropertyValue("--gdg-bg-cell").trim() ||
            computed.backgroundColor
          );
        });
      expect(glideBgCell).not.toContain("255, 255, 255");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("spreadsheet zoom rendering stays stable across five zoom levels", async ({
    page,
  }, testInfo) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: false,
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    await clearProjectChatWindows(page);

    try {
      const root = await postBackend<RootResponse>(
        page,
        "/getFileBrowserRoot",
        null,
      );
      const rootPath = root?.rootPath;
      if (!rootPath) {
        throw new Error("Missing file browser root path.");
      }
      const csvPath = `${rootPath}/pw-zoom-sheet.csv`;
      await fs.writeFile(
        csvPath,
        "task,status\nalpha,done\nbeta,todo\ngamma,todo\n",
        "utf-8",
      );

      const spreadsheetSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Spreadsheet",
      );
      const browserSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Browser",
      );

      const spreadsheetNode = page.locator(
        `.setta-gpu-flow__node[data-id="${spreadsheetSectionId}"]`,
      );
      const browserNode = page.locator(
        `.setta-gpu-flow__node[data-id="${browserSectionId}"]`,
      );
      await expect(spreadsheetNode).toBeVisible();
      await expect(browserNode).toBeVisible();

      const browserExplorer = browserNode
        .locator('[role="region"][aria-label="File explorer"]')
        .first();
      await expect(browserExplorer).toBeVisible();
      const csvRow = browserExplorer
        .locator("button")
        .filter({ hasText: "pw-zoom-sheet.csv" })
        .first();
      await expect(csvRow).toBeVisible({ timeout: 15000 });
      await dragBrowserRowToTarget(
        csvRow,
        spreadsheetNode.locator(".section-main").first(),
      );

      const spreadsheetGrid = spreadsheetNode.getByTestId(
        "spreadsheet-glide-grid",
      );
      await expect(spreadsheetGrid).toBeVisible();
      await expect(
        spreadsheetNode.getByText("4 rows · 2 columns"),
      ).toBeVisible();

      const zoomPresets = [
        { label: "zoom-out-6", zoomOutClicks: 6, zoomInClicks: 0 },
        { label: "zoom-out-3", zoomOutClicks: 3, zoomInClicks: 0 },
        { label: "zoom-reset", zoomOutClicks: 0, zoomInClicks: 0 },
        { label: "zoom-in-2", zoomOutClicks: 0, zoomInClicks: 2 },
        { label: "zoom-in-4", zoomOutClicks: 0, zoomInClicks: 4 },
      ] as const;

      const samples: Array<{
        label: string;
        zoom: number;
        densityX: number;
        densityY: number;
        baseFontPx: number;
        effectiveFontPx: number;
      }> = [];

      for (const preset of zoomPresets) {
        const zoom = await applyZoomPreset(
          page,
          preset.zoomOutClicks,
          preset.zoomInClicks,
        );
        const metrics =
          await getSpreadsheetCanvasDensityMetrics(spreadsheetNode);
        samples.push({
          label: preset.label,
          zoom,
          densityX: metrics.densityX,
          densityY: metrics.densityY,
          baseFontPx: metrics.baseFontPx,
          effectiveFontPx:
            (metrics.baseFontPx /
              getExpectedSpreadsheetDensityMultiplier(zoom)) *
            zoom,
        });

        await testInfo.attach(`spreadsheet-${preset.label}.png`, {
          body: await spreadsheetNode.screenshot(),
          contentType: "image/png",
        });
      }

      await testInfo.attach("spreadsheet-zoom-density-metrics.json", {
        body: Buffer.from(JSON.stringify(samples, null, 2), "utf-8"),
        contentType: "application/json",
      });

      const zoomValues = samples.map((sample) => sample.zoom);
      const distinctZoomCount = new Set(
        zoomValues.map((zoom) => zoom.toFixed(3)),
      ).size;
      expect(
        distinctZoomCount,
        `Unexpected zoom levels: ${JSON.stringify(zoomValues)}`,
      ).toBe(5);

      const sortedByZoom = [...samples].sort(
        (left, right) => left.zoom - right.zoom,
      );
      for (const sample of sortedByZoom) {
        expect(Number.isFinite(sample.baseFontPx)).toBe(true);
        expect(Number.isFinite(sample.effectiveFontPx)).toBe(true);
      }
      expect(sortedByZoom[0]?.zoom ?? 0).toBeLessThan(
        sortedByZoom[1]?.zoom ?? 0,
      );
      expect(sortedByZoom[1]?.zoom ?? 0).toBeLessThan(
        sortedByZoom[2]?.zoom ?? 0,
      );
      expect(sortedByZoom[2]?.zoom ?? 0).toBeLessThan(
        sortedByZoom[3]?.zoom ?? 0,
      );
      expect(sortedByZoom[3]?.zoom ?? 0).toBeLessThan(
        sortedByZoom[4]?.zoom ?? 0,
      );
      expect(
        (sortedByZoom[4]?.zoom ?? 0) - (sortedByZoom[0]?.zoom ?? 0),
      ).toBeGreaterThan(0.5);

      const maxSample = sortedByZoom[4];
      const midInSample = sortedByZoom[3];
      const farOutSample = sortedByZoom[0];
      if (!maxSample || !midInSample || !farOutSample) {
        throw new Error(
          "Missing zoom sample set for spreadsheet density checks.",
        );
      }

      expect(maxSample.densityX).toBeGreaterThanOrEqual(0.95);
      expect(maxSample.densityX).toBeGreaterThanOrEqual(
        midInSample.densityX * 0.9,
      );
      expect(maxSample.densityY).toBeGreaterThanOrEqual(0.95);
      expect(farOutSample.densityX).toBeGreaterThanOrEqual(1);
      expect(farOutSample.densityY).toBeGreaterThanOrEqual(1);

      const effectiveFontPxByZoom = sortedByZoom.map(
        (sample) => sample.effectiveFontPx,
      );
      const effectiveFontDebug = JSON.stringify(effectiveFontPxByZoom);
      expect(
        sortedByZoom[0]?.effectiveFontPx ?? 0,
        `effectiveFontPxByZoom=${effectiveFontDebug}`,
      ).toBeLessThan(sortedByZoom[1]?.effectiveFontPx ?? 0);
      expect(
        sortedByZoom[1]?.effectiveFontPx ?? 0,
        `effectiveFontPxByZoom=${effectiveFontDebug}`,
      ).toBeLessThan(sortedByZoom[2]?.effectiveFontPx ?? 0);
      expect(
        sortedByZoom[2]?.effectiveFontPx ?? 0,
        `effectiveFontPxByZoom=${effectiveFontDebug}`,
      ).toBeLessThan(sortedByZoom[3]?.effectiveFontPx ?? 0);
      expect(
        sortedByZoom[3]?.effectiveFontPx ?? 0,
        `effectiveFontPxByZoom=${effectiveFontDebug}`,
      ).toBeLessThan(sortedByZoom[4]?.effectiveFontPx ?? 0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("file browser uses bottom universal preview with csv/xlsx/pdf support", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "FileBrowser",
      overviewVis: true,
      uiEditorVis: false,
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    await clearProjectChatWindows(page);

    try {
      const root = await postBackend<RootResponse>(
        page,
        "/getFileBrowserRoot",
        null,
      );
      const rootPath = root?.rootPath;
      if (!rootPath) {
        throw new Error("Missing file browser root path.");
      }

      const csvPath = `${rootPath}/pw-sheet.csv`;
      await fs.writeFile(csvPath, "task,status\nalpha,todo\n", "utf-8");
      const pdfPath = `${rootPath}/pw-sheet.pdf`;
      await fs.writeFile(
        pdfPath,
        Buffer.from(
          "%PDF-1.1\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 120] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 38 >>\nstream\nBT /F1 14 Tf 24 60 Td (PDF Preview) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000202 00000 n \ntrailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n287\n%%EOF\n",
          "utf-8",
        ),
      );

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        ["Task", "Owner"],
        ["Beta", "Dev"],
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      const xlsxBytes = XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
      }) as Buffer;
      const xlsxPath = `${rootPath}/pw-sheet.xlsx`;
      await fs.writeFile(xlsxPath, xlsxBytes);

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".setta-gpu-flow__pane");

      const listPane = page.getByTestId("file-browser-list-pane");
      const previewPane = page.getByTestId("file-browser-preview-pane");
      const previewToggle = page.getByTestId("file-browser-preview-toggle");
      const previewResizeHandle = page.getByTestId(
        "file-browser-preview-resize-handle",
      );
      await expect(listPane).toBeVisible();
      await expect(previewPane).toBeVisible();
      await expect(previewToggle).toBeVisible();
      await expect(previewResizeHandle).toBeVisible();
      const listBox = await listPane.boundingBox();
      const previewBox = await previewPane.boundingBox();
      if (!listBox || !previewBox) {
        throw new Error("Missing file browser pane bounding boxes.");
      }
      expect(previewBox.y).toBeGreaterThan(listBox.y + 10);

      const resizeBox = await previewResizeHandle.boundingBox();
      if (!resizeBox) {
        throw new Error("Missing preview resize handle bounds.");
      }
      await page.mouse.move(
        resizeBox.x + resizeBox.width / 2,
        resizeBox.y + resizeBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        resizeBox.x + resizeBox.width / 2,
        resizeBox.y + resizeBox.height / 2 + 80,
      );
      await page.mouse.up();

      const resizedListBox = await listPane.boundingBox();
      const resizedPreviewBox = await previewPane.boundingBox();
      if (!resizedListBox || !resizedPreviewBox) {
        throw new Error("Missing resized pane bounds.");
      }
      expect(resizedListBox.height).toBeGreaterThan(listBox.height + 20);
      expect(resizedPreviewBox.height).toBeLessThan(previewBox.height - 20);

      await previewToggle.click();
      await expect(page.getByTestId("file-browser-preview-pane")).toHaveCount(
        0,
      );
      await previewToggle.click();
      await expect(page.getByTestId("file-browser-preview-pane")).toBeVisible();

      const pdfRow = page.locator("button").filter({ hasText: "pw-sheet.pdf" });
      await expect(pdfRow).toBeVisible({ timeout: 20000 });
      await pdfRow.first().click();
      await expect(
        previewPane.locator('[data-spreadsheet-cell="1:1"]'),
      ).toHaveCount(0);
      await expect
        .poll(async () => {
          const pdfCount = await page
            .getByTestId("file-browser-universal-preview-pdf")
            .count();
          const unavailableCount = await previewPane
            .getByText("Preview unavailable.")
            .count();
          return pdfCount + unavailableCount;
        })
        .toBeGreaterThan(0);

      const csvRow = page.locator("button").filter({ hasText: "pw-sheet.csv" });
      await expect(csvRow).toBeVisible({ timeout: 20000 });
      await csvRow.first().click();

      const targetCell = previewPane
        .locator('[data-spreadsheet-cell="1:1"]')
        .first();
      await expect(targetCell).toBeVisible();
      await expect(targetCell).toHaveValue("todo");
      await targetCell.fill("done");
      await targetCell.press("Enter");
      await expect(previewPane.getByText("Unsaved edits.")).toBeVisible();
      await expect(targetCell).toHaveValue("done");

      const xlsxRow = page
        .locator("button")
        .filter({ hasText: "pw-sheet.xlsx" });
      await expect(xlsxRow).toBeVisible({ timeout: 20000 });
      await xlsxRow.first().click();

      const xlsxCell = previewPane
        .locator('[data-spreadsheet-cell="1:0"]')
        .first();
      await expect(xlsxCell).toBeVisible();
      await expect(xlsxCell).toHaveValue("Beta");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
