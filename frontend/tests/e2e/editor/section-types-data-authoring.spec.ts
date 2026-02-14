import { expect, test, type Locator, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import * as XLSX from "xlsx";
import {
  cleanupIsolatedProject,
  createTextBlockSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      sectionVariantMap?: Record<string, string>;
    };
    sectionVariants?: Record<string, { impl: string }>;
    sectionImpls?: Record<
      string,
      {
        type: string;
        codeObjVariantMap?: Record<string, string>;
        allowUnquotedStringArgs?: boolean;
        defaultChildSectionType?: string;
        viewMode?: string;
        readOnly?: boolean;
        showRowNumbers?: boolean;
        density?: string;
        autoReloadOnExternalChange?: boolean;
      }
    >;
    parentSectionMap?: Record<string, string | null>;
  };
};

type FileBrowserRootResponse = {
  rootPath: string;
};

type FileBrowserFileContentResponse = {
  contentBase64: string;
};

async function getLatestProjectState(
  page: Page,
  projectConfigId: string,
): Promise<LatestProjectStateResponse> {
  return (
    (await postBackend<LatestProjectStateResponse>(
      page,
      "/getLatestProjectState",
      {
        projectConfigId,
      },
    )) ?? {}
  );
}

async function createTopLevelSection(
  page: Page,
  projectConfigId: string,
  implType: string,
): Promise<string> {
  const res = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType,
    },
  );
  const sectionId = res?.sectionId;
  if (!sectionId) {
    throw new Error(`Failed to create ${implType} section.`);
  }
  return sectionId;
}

async function dragBrowserRowToTarget(
  source: Locator,
  target: Locator,
): Promise<void> {
  const page = source.page();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  await target.dispatchEvent("dragenter", { dataTransfer });
  await target.dispatchEvent("dragover", { dataTransfer });
  await target.dispatchEvent("drop", { dataTransfer });
  await source.dispatchEvent("dragend", { dataTransfer });
}

function getChildSectionIds(
  latest: LatestProjectStateResponse,
  parentSectionId: string,
): string[] {
  return Object.entries(latest.projectState?.parentSectionMap ?? {})
    .filter(([, parentId]) => parentId === parentSectionId)
    .map(([childId]) => childId);
}

test.describe.serial("section types data authoring", () => {
  test("text block master font slider scales markdown typography", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { TextBlock: "SectionConfig" },
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const { sectionId } = await createTextBlockSection(
        page,
        projectContext.projectConfigId,
        "__pw_textblock_font__",
      );
      await postBackend(page, "/setTextBlockText", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        text: "# Heading\n\nBody text",
      });
      await postBackend(page, "/setTextBlockFormat", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        format: "Markdown",
      });
      await postBackend(page, "/setTextBlockDisplayMode", {
        projectConfigId: projectContext.projectConfigId,
        sectionId,
        textDisplayMode: "Render",
      });

      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      const heading = node.locator("h1").first();
      const body = node.locator("p").first();
      await expect(heading).toBeVisible();
      await expect(body).toBeVisible();

      const before = await node.evaluate((el) => {
        const h1 = el.querySelector("h1");
        const p = el.querySelector("p");
        if (!(h1 instanceof HTMLElement) || !(p instanceof HTMLElement)) {
          throw new Error("Missing markdown heading/body nodes.");
        }
        return {
          h1: parseFloat(window.getComputedStyle(h1).fontSize),
          p: parseFloat(window.getComputedStyle(p).fontSize),
        };
      });

      const uiEditorPane = page.locator("#UiEditorPane");
      const masterFontCard = uiEditorPane
        .locator("div")
        .filter({ hasText: "Master Font Size" })
        .first();
      await expect(masterFontCard).toBeVisible();

      const slider = masterFontCard.locator('input[type="range"]').first();
      await slider.evaluate((el: HTMLInputElement) => {
        const input = el;
        const descriptor = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        );
        descriptor?.set?.call(input, "24");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await expect.poll(async () => await slider.inputValue()).toBe("24");

      await expect
        .poll(async () => {
          return await node.evaluate((el) => {
            const h1 = el.querySelector("h1");
            const p = el.querySelector("p");
            if (!(h1 instanceof HTMLElement) || !(p instanceof HTMLElement)) {
              return { h1: 0, p: 0 };
            }
            return {
              h1: parseFloat(window.getComputedStyle(h1).fontSize),
              p: parseFloat(window.getComputedStyle(p).fontSize),
            };
          });
        })
        .toEqual(
          expect.objectContaining({
            h1: expect.any(Number),
            p: expect.any(Number),
          }),
        );

      const after = await node.evaluate((el) => {
        const h1 = el.querySelector("h1");
        const p = el.querySelector("p");
        if (!(h1 instanceof HTMLElement) || !(p instanceof HTMLElement)) {
          throw new Error("Missing markdown heading/body nodes.");
        }
        return {
          h1: parseFloat(window.getComputedStyle(h1).fontSize),
          p: parseFloat(window.getComputedStyle(p).fontSize),
        };
      });

      expect(after.h1).toBeGreaterThan(before.h1);
      expect(after.p).toBeGreaterThan(0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("list root default child type drives incrementer-created child kind", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { ListRoot: "SectionConfig" },
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "ListRoot",
      );
      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      const uiEditorPane = page.locator("#UiEditorPane");
      const defaultChildCard = uiEditorPane
        .locator("div")
        .filter({ hasText: "Default Child Section" })
        .first();
      await expect(defaultChildCard).toBeVisible();
      const defaultSelect = defaultChildCard.locator("select").first();
      await defaultSelect.selectOption("TextBlock");

      const plusButton = node.locator("button.gg-math-plus").first();
      await expect(plusButton).toBeVisible();
      await plusButton.click();

      await expect
        .poll(async () => {
          const latest = await getLatestProjectState(
            page,
            projectContext.projectConfigId,
          );
          const children = getChildSectionIds(latest, sectionId);
          if (children.length === 0) {
            return [];
          }
          const sectionVariantMap =
            latest.projectState?.projectConfig?.sectionVariantMap ?? {};
          const sectionVariants = latest.projectState?.sectionVariants ?? {};
          const sectionImpls = latest.projectState?.sectionImpls ?? {};
          return children
            .map((childId) => sectionVariantMap[childId])
            .filter((variantId): variantId is string => Boolean(variantId))
            .map((variantId) => sectionVariants[variantId]?.impl)
            .filter((implId): implId is string => Boolean(implId))
            .map((implId) => sectionImpls[implId]?.type)
            .filter((type): type is string => Boolean(type));
        })
        .toContain("TextBlock");
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("list root view mode toggles between kanban and task list layout", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      uiEditorTab: { ListRoot: "SectionConfig" },
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "ListRoot",
      );
      const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
      await expect(node).toBeVisible();
      await node.click();

      const uiEditorPane = page.locator("#UiEditorPane");
      const defaultChildCard = uiEditorPane
        .locator("div")
        .filter({ hasText: "Default Child Section" })
        .first();
      await expect(defaultChildCard).toBeVisible();
      await defaultChildCard
        .locator("select")
        .first()
        .selectOption("TextBlock");

      const plusButton = node.locator("button.gg-math-plus").first();
      await expect(plusButton).toBeVisible();
      await plusButton.click();
      await plusButton.click();

      await expect
        .poll(async () => {
          const latest = await getLatestProjectState(
            page,
            projectContext.projectConfigId,
          );
          return getChildSectionIds(latest, sectionId).length;
        })
        .toBeGreaterThanOrEqual(2);
      const latestWithChildren = await getLatestProjectState(
        page,
        projectContext.projectConfigId,
      );
      const childIds = getChildSectionIds(latestWithChildren, sectionId).slice(
        0,
        2,
      );

      await expect(defaultChildCard).toContainText("List Root View");
      let viewModeSelect = defaultChildCard.locator("select").nth(1);
      await expect(viewModeSelect).toBeVisible();

      await viewModeSelect.selectOption("kanban");
      await expect(viewModeSelect).toHaveValue("kanban");

      const kanbanDistances = await page.evaluate((ids) => {
        const first = document.querySelector(
          `[data-sortable-section-id="${ids[0]}"]`,
        ) as HTMLElement | null;
        const second = document.querySelector(
          `[data-sortable-section-id="${ids[1]}"]`,
        ) as HTMLElement | null;
        if (!first || !second) {
          return null;
        }
        const firstRect = first.getBoundingClientRect();
        const secondRect = second.getBoundingClientRect();
        return {
          xDelta: Math.abs(firstRect.x - secondRect.x),
          yDelta: Math.abs(firstRect.y - secondRect.y),
        };
      }, childIds);
      expect(kanbanDistances).not.toBeNull();
      expect(
        (kanbanDistances?.xDelta ?? 0) > (kanbanDistances?.yDelta ?? 0),
      ).toBe(true);

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".react-flow__pane");
      const reloadedNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(reloadedNode).toBeVisible();
      await reloadedNode.click();
      viewModeSelect = page
        .locator("#UiEditorPane")
        .locator("div")
        .filter({ hasText: "Default Child Section" })
        .first()
        .locator("select")
        .nth(1);
      await expect(viewModeSelect).toHaveValue("kanban");

      await viewModeSelect.selectOption("task_list");
      await expect(viewModeSelect).toHaveValue("task_list");

      const taskListDistances = await page.evaluate((ids) => {
        const first = document.querySelector(
          `[data-sortable-section-id="${ids[0]}"]`,
        ) as HTMLElement | null;
        const second = document.querySelector(
          `[data-sortable-section-id="${ids[1]}"]`,
        ) as HTMLElement | null;
        if (!first || !second) {
          return null;
        }
        const firstRect = first.getBoundingClientRect();
        const secondRect = second.getBoundingClientRect();
        return {
          xDelta: Math.abs(firstRect.x - secondRect.x),
          yDelta: Math.abs(firstRect.y - secondRect.y),
        };
      }, childIds);
      expect(taskListDistances).not.toBeNull();
      expect(
        (taskListDistances?.yDelta ?? 0) >= (taskListDistances?.xDelta ?? 0),
      ).toBe(true);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("clock, calendar, task board, and spreadsheet sections are visible and interactive", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: true,
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const root = await postBackend<FileBrowserRootResponse>(
        page,
        "/getFileBrowserRoot",
        null,
      );
      const rootPath = root?.rootPath;
      if (!rootPath) {
        throw new Error("Missing file browser root path.");
      }
      const csvPath = `${rootPath}/pw-spreadsheet-section.csv`;
      await fs.writeFile(csvPath, "task,status\nalpha,todo\n", "utf-8");

      const clockSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Clock",
      );
      const calendarSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "Calendar",
      );
      const taskBoardSectionId = await createTopLevelSection(
        page,
        projectContext.projectConfigId,
        "TaskBoard",
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

      const clockNode = page.locator(
        `.react-flow__node[data-id="${clockSectionId}"]`,
      );
      const calendarNode = page.locator(
        `.react-flow__node[data-id="${calendarSectionId}"]`,
      );
      const taskBoardNode = page.locator(
        `.react-flow__node[data-id="${taskBoardSectionId}"]`,
      );
      const spreadsheetNode = page.locator(
        `.react-flow__node[data-id="${spreadsheetSectionId}"]`,
      );
      const browserNode = page.locator(
        `.react-flow__node[data-id="${browserSectionId}"]`,
      );

      await expect(clockNode).toBeVisible();
      await expect(calendarNode).toBeVisible();
      await expect(taskBoardNode).toBeVisible();
      await expect(spreadsheetNode).toBeVisible();
      await expect(browserNode).toBeVisible();

      await expect(clockNode.locator("text=/\\d{1,2}:\\d{2}/")).toBeVisible();

      const calendarDateButton = calendarNode
        .locator("[data-calendar-date]")
        .nth(12);
      const calendarIso =
        await calendarDateButton.getAttribute("data-calendar-date");
      if (!calendarIso) {
        throw new Error("Missing calendar date identifier.");
      }
      await calendarDateButton.click();
      await expect(
        calendarNode.getByText(`Selected: ${calendarIso}`),
      ).toBeVisible();

      await taskBoardNode
        .getByPlaceholder("Add task title")
        .fill("ship task board");
      await taskBoardNode.getByTestId("task-board-add-task").click();
      await expect(
        taskBoardNode.locator('input[value="ship task board"]').first(),
      ).toBeVisible();
      await taskBoardNode.getByTestId("task-board-view-kanban").click();
      await expect(
        taskBoardNode.locator("[data-task-board-column-id]"),
      ).toHaveCount(3);

      await expect(
        spreadsheetNode.getByPlaceholder("/absolute/path/to/file.csv"),
      ).toHaveCount(0);
      const browserExplorer = browserNode
        .locator('[role="region"][aria-label="File explorer"]')
        .first();
      await expect(browserExplorer).toBeVisible();
      const csvRow = browserExplorer
        .locator("button")
        .filter({ hasText: "pw-spreadsheet-section.csv" })
        .first();
      await expect(csvRow).toBeVisible({ timeout: 15000 });
      await dragBrowserRowToTarget(
        csvRow,
        spreadsheetNode.locator(".section-main").first(),
      );
      const spreadsheetGlideGrid = spreadsheetNode.getByTestId(
        "spreadsheet-glide-grid",
      );
      await expect(spreadsheetGlideGrid).toBeVisible();

      const spreadsheetAddRow = spreadsheetNode.getByTestId("spreadsheet-add-row");
      await expect(spreadsheetAddRow).toBeEnabled();
      await spreadsheetNode.click();
      const uiEditorPane = page.locator("#UiEditorPane");
      const readOnlyToggleLabel = uiEditorPane
        .locator("label")
        .filter({ hasText: "Read-only grid" })
        .first();
      await expect(readOnlyToggleLabel).toBeVisible();
      const readOnlyToggle = readOnlyToggleLabel
        .locator('input[type="checkbox"]')
        .first();
      await expect(readOnlyToggle).toBeAttached();
      await readOnlyToggleLabel.click();
      await expect(readOnlyToggle).toBeChecked();
      await expect(spreadsheetAddRow).toBeDisabled();
      await expect(spreadsheetNode.getByText("Read-only.")).toBeVisible();
      await readOnlyToggleLabel.click();
      await expect(readOnlyToggle).not.toBeChecked();
      await expect(spreadsheetAddRow).toBeEnabled();

      const rowNumbersToggleLabel = uiEditorPane
        .locator("label")
        .filter({ hasText: "Show row numbers" })
        .first();
      const rowNumbersToggle = rowNumbersToggleLabel
        .locator('input[type="checkbox"]')
        .first();
      await rowNumbersToggleLabel.click();
      await expect(rowNumbersToggle).not.toBeChecked();

      const densitySelect = uiEditorPane
        .locator("label")
        .filter({ hasText: "Grid density" })
        .locator("select")
        .first();
      await densitySelect.selectOption("comfortable");
      await expect(densitySelect).toHaveValue("comfortable");

      await spreadsheetAddRow.click();
      await expect(spreadsheetNode.getByText("Unsaved edits.")).toBeVisible();
      await spreadsheetNode.getByTestId("spreadsheet-save").click();
      await expect(spreadsheetNode.getByText("Saved.")).toBeVisible();

      const csvRead = await postBackend<FileBrowserFileContentResponse>(
        page,
        "/getFileBrowserFileContent",
        { path: csvPath },
      );
      const csvDecoded = Buffer.from(
        csvRead?.contentBase64 ?? "",
        "base64",
      ).toString("utf-8");
      expect(csvDecoded).toContain("alpha,todo");
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

    try {
      const root = await postBackend<FileBrowserRootResponse>(
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
      await page.waitForSelector(".react-flow__pane");

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
      await targetCell.fill("done");
      await page.getByTestId("spreadsheet-save").click();
      await expect(page.getByText("Saved.")).toBeVisible();

      const csvRead = await postBackend<FileBrowserFileContentResponse>(
        page,
        "/getFileBrowserFileContent",
        { path: csvPath },
      );
      const csvDecoded = Buffer.from(
        csvRead?.contentBase64 ?? "",
        "base64",
      ).toString("utf-8");
      expect(csvDecoded).toContain("alpha,done");

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
