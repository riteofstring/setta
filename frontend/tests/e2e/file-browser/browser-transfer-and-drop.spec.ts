import { expect, type Locator, type Page, test } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  cleanupIsolatedProject,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";
const COPY_SHORTCUT = process.platform === "darwin" ? "Meta+C" : "Control+C";
const CUT_SHORTCUT = process.platform === "darwin" ? "Meta+X" : "Control+X";
const PASTE_SHORTCUT = process.platform === "darwin" ? "Meta+V" : "Control+V";

type RootResponse = {
  rootPath: string;
};

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
        filePath?: string;
        codeFileBinding?: { canonical_path?: string | null } | null;
      }
    >;
  };
};

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

async function fillCodeMirror(editorRoot: Locator, page: Page, value: string) {
  await expect(editorRoot).toBeVisible();
  const editorId = await editorRoot.getAttribute("id");
  if (!editorId) {
    throw new Error("CodeMirror root is missing id.");
  }
  const updatedWithEditorState = await page.evaluate(
    ({ targetId, nextValue }) => {
      const root = document.getElementById(targetId);
      if (!root) {
        return false;
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
            cmView?: {
              state?: { doc?: { length: number } };
              dispatch?: (tx: {
                changes: { from: number; to: number; insert: string };
              }) => void;
              focus?: () => void;
            };
          }
        ).cmView;
        if (!view?.state?.doc || typeof view.dispatch !== "function") {
          continue;
        }
        view.dispatch({
          changes: {
            from: 0,
            to: view.state.doc.length,
            insert: nextValue,
          },
        });
        view.focus?.();
        return true;
      }
      return false;
    },
    { targetId: editorId, nextValue: value },
  );
  if (updatedWithEditorState) {
    await expect
      .poll(() => readCodeMirrorValue(page, editorId))
      .toContain(value);
    return;
  }
  const content = editorRoot.locator(".cm-content").first();
  await expect(content).toBeVisible();
  await content.click();
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.press("Backspace");
  await page.keyboard.insertText(value);
  await expect.poll(() => readCodeMirrorValue(page, editorId)).toContain(value);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
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

async function clickDom(button: Locator): Promise<void> {
  await expect(button).toBeVisible();
  await button.evaluate((element: HTMLElement) => {
    element.click();
  });
}

async function dropNativeFileToTarget(
  target: Locator,
  file: {
    name: string;
    content: string;
    mimeType?: string;
  },
): Promise<void> {
  const page = target.page();
  const targetHandle = await target.elementHandle();
  if (!targetHandle) {
    throw new Error("Failed to resolve drop target element.");
  }
  await page.evaluate(
    ({ element, name, content, mimeType }) => {
      const transfer = new DataTransfer();
      const nativeFile = new File([content], name, {
        type: mimeType ?? "application/octet-stream",
      });
      transfer.items.add(nativeFile);
      for (const eventName of ["dragenter", "dragover", "drop"]) {
        const dragEvent = new DragEvent(eventName, {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        });
        element.dispatchEvent(dragEvent);
      }
    },
    {
      element: targetHandle,
      ...file,
    },
  );
}

async function loadLatestProjectState(
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

function findSpreadsheetSectionIdForPath(
  latest: LatestProjectStateResponse,
  filePath: string,
): string | null {
  const normalizedFilePath = normalizePathForComparison(filePath);
  const sectionVariantMap =
    latest.projectState?.projectConfig?.sectionVariantMap ?? {};
  const sectionVariants = latest.projectState?.sectionVariants ?? {};
  const sectionImpls = latest.projectState?.sectionImpls ?? {};
  for (const [sectionId, variantId] of Object.entries(sectionVariantMap)) {
    const implId = sectionVariants[variantId]?.impl;
    if (!implId) {
      continue;
    }
    const impl = sectionImpls[implId];
    if (!impl || impl.type !== "Spreadsheet") {
      continue;
    }
    if (
      normalizePathForComparison((impl.filePath ?? "").trim()) ===
      normalizedFilePath
    ) {
      return sectionId;
    }
  }
  return null;
}

function hasCodeSectionForPath(
  latest: LatestProjectStateResponse,
  filePath: string,
): boolean {
  const normalizedFilePath = normalizePathForComparison(filePath);
  const sectionVariantMap =
    latest.projectState?.projectConfig?.sectionVariantMap ?? {};
  const sectionVariants = latest.projectState?.sectionVariants ?? {};
  const sectionImpls = latest.projectState?.sectionImpls ?? {};
  for (const variantId of Object.values(sectionVariantMap)) {
    const implId = sectionVariants[variantId]?.impl;
    if (!implId) {
      continue;
    }
    const impl = sectionImpls[implId];
    if (!impl || impl.type !== "Code") {
      continue;
    }
    if (
      normalizePathForComparison(impl.codeFileBinding?.canonical_path ?? "") ===
      normalizedFilePath
    ) {
      return true;
    }
  }
  return false;
}

test.describe.serial("file browser transfer and drag/drop", () => {
  test("explorer drag-and-drop opens sections and spreadsheet accepts file drops", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: false,
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

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

      const csvName = "pw-drop-source.csv";
      const csvPath = path.join(rootPath, csvName);
      const viewsCsvName = "pw-drop-views.csv";
      const viewsCsvPath = path.join(rootPath, viewsCsvName);
      const codeName = "pw-drop-source.py";
      const codePath = path.join(rootPath, codeName);
      const binaryName = "pw-drop-source.bin";
      const binaryPath = path.join(rootPath, binaryName);
      await fs.writeFile(csvPath, "task,status\nalpha,todo\n", "utf-8");
      await fs.writeFile(viewsCsvPath, "task,status\nbeta,doing\n", "utf-8");
      await fs.writeFile(codePath, "print('drop source')\n", "utf-8");
      await fs.writeFile(binaryPath, Buffer.from([0, 255, 1, 2]));

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
          projectConfigId: projectContext.projectConfigId,
          implType: "Browser",
          viewportBounds,
        },
      );
      const browserSectionId = browserSection?.sectionId;
      if (!browserSectionId) {
        throw new Error("Missing sectionId when creating browser section.");
      }
      const spreadsheetSection = await postBackend<{ sectionId?: string }>(
        page,
        "/createTopLevelSection",
        {
          projectConfigId: projectContext.projectConfigId,
          implType: "Spreadsheet",
          viewportBounds,
        },
      );
      const spreadsheetSectionId = spreadsheetSection?.sectionId;
      if (!spreadsheetSectionId) {
        throw new Error("Missing sectionId when creating spreadsheet section.");
      }

      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForSelector(".react-flow__pane");
      const browserNode = page.locator(
        `.react-flow__node[data-id="${browserSectionId}"]`,
      );
      await expect(browserNode).toBeVisible();
      const browserPathEditor = browserNode.locator(
        `[id="CodeMirror-${browserSectionId}-browser-path"]`,
      );
      await fillCodeMirror(browserPathEditor, page, rootPath);
      await page.keyboard.press("Enter");

      const explorer = browserNode
        .locator('[role="region"][aria-label="File explorer"]')
        .first();
      await expect(explorer).toBeVisible();
      const filterEditor = browserNode
        .locator('[id^="CodeMirror-FileBrowserFilter-"]')
        .first();
      await fillCodeMirror(filterEditor, page, csvName);
      const csvRow = explorer
        .locator("button")
        .filter({ hasText: csvName })
        .first();
      await expect(csvRow).toBeVisible({ timeout: 15000 });
      await csvRow.dblclick();
      await expect
        .poll(async () => {
          const latest = await loadLatestProjectState(
            page,
            projectContext.projectConfigId,
          );
          return findSpreadsheetSectionIdForPath(latest, csvPath);
        })
        .not.toBeNull();

      const canvasPane = page.locator(".react-flow__pane").first();
      await dragBrowserRowToTarget(csvRow, canvasPane);

      await expect
        .poll(async () => {
          const latest = await loadLatestProjectState(
            page,
            projectContext.projectConfigId,
          );
          return findSpreadsheetSectionIdForPath(latest, csvPath);
        })
        .not.toBeNull();

      await fillCodeMirror(filterEditor, page, codeName);
      const codeRow = explorer
        .locator("button")
        .filter({ hasText: codeName })
        .first();
      await expect(codeRow).toBeVisible({ timeout: 15000 });
      await dragBrowserRowToTarget(codeRow, canvasPane);
      await expect
        .poll(async () => {
          const latest = await loadLatestProjectState(
            page,
            projectContext.projectConfigId,
          );
          return hasCodeSectionForPath(latest, codePath);
        })
        .toBe(true);

      await fillCodeMirror(filterEditor, page, binaryName);
      const binaryRow = explorer
        .locator("button")
        .filter({ hasText: binaryName })
        .first();
      await expect(binaryRow).toBeVisible({ timeout: 15000 });
      await dragBrowserRowToTarget(binaryRow, canvasPane);
      await expect(
        page.getByText(
          "Binary files cannot be auto-opened as sections from drag-and-drop.",
        ),
      ).toBeVisible();

      await fillCodeMirror(filterEditor, page, csvName);
      await expect(csvRow).toBeVisible({ timeout: 15000 });
      const spreadsheetNode = page.locator(
        `.react-flow__node[data-id="${spreadsheetSectionId}"]`,
      );
      await expect(spreadsheetNode).toBeVisible();
      await dragBrowserRowToTarget(
        csvRow,
        spreadsheetNode.locator(".section-main").first(),
      );

      await expect(
        spreadsheetNode.getByPlaceholder("/absolute/path/to/file.csv"),
      ).toHaveCount(0);
      await expect(
        spreadsheetNode.getByTestId("spreadsheet-glide-grid"),
      ).toBeVisible();
      await expect(spreadsheetNode.getByText(csvName)).toBeVisible();
      await expect(
        spreadsheetNode.getByText("2 rows · 2 columns"),
      ).toBeVisible();

      await fillCodeMirror(filterEditor, page, viewsCsvName);
      await clickDom(
        browserNode.getByRole("button", { name: "Icon view", exact: true }),
      );
      const thumbnailItem = browserNode
        .locator("[data-browser-thumbnail-path]")
        .filter({ hasText: viewsCsvName })
        .first();
      await expect(thumbnailItem).toBeVisible({ timeout: 15000 });
      await dragBrowserRowToTarget(thumbnailItem, canvasPane);
      await expect
        .poll(async () => {
          const latest = await loadLatestProjectState(
            page,
            projectContext.projectConfigId,
          );
          return findSpreadsheetSectionIdForPath(latest, viewsCsvPath);
        })
        .not.toBeNull();

      await clickDom(
        browserNode.getByRole("button", { name: "Carousel view", exact: true }),
      );
      const carouselItem = browserNode
        .locator("button[data-media-carousel-item-id]")
        .filter({ hasText: viewsCsvName })
        .first();
      await expect(carouselItem).toBeVisible({ timeout: 15000 });
      await dragBrowserRowToTarget(
        carouselItem,
        spreadsheetNode.locator(".section-main").first(),
      );
      await expect(spreadsheetNode.getByText(viewsCsvName)).toBeVisible();
      await expect(
        spreadsheetNode.getByText("2 rows · 2 columns"),
      ).toBeVisible();

      const nativeCanvasCsvName = `pw-native-canvas-${Date.now()}.csv`;
      const nativeCanvasCsvPath = path.join(rootPath, nativeCanvasCsvName);
      await dropNativeFileToTarget(canvasPane, {
        name: nativeCanvasCsvName,
        content: "task,status\nos-canvas,queued\n",
        mimeType: "text/csv",
      });
      await expect
        .poll(async () => {
          const latest = await loadLatestProjectState(
            page,
            projectContext.projectConfigId,
          );
          return findSpreadsheetSectionIdForPath(latest, nativeCanvasCsvPath);
        })
        .not.toBeNull();

      const nativeSheetCsvName = `pw-native-sheet-${Date.now()}.csv`;
      await dropNativeFileToTarget(
        spreadsheetNode.locator(".section-main").first(),
        {
          name: nativeSheetCsvName,
          content: "task,status\nos-sheet,done\n",
          mimeType: "text/csv",
        },
      );
      await expect(spreadsheetNode.getByText(nativeSheetCsvName)).toBeVisible();
      await expect(
        spreadsheetNode.getByText("2 rows · 2 columns"),
      ).toBeVisible();

      await dropNativeFileToTarget(canvasPane, {
        name: `pw-native-binary-${Date.now()}.bin`,
        content: "\u0000\u00ff\u0001\u0002",
        mimeType: "application/octet-stream",
      });
      await expect(
        page.getByText(
          "Binary files cannot be auto-opened as sections from drag-and-drop.",
        ),
      ).toBeVisible();
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("browser list moves files/folders by drag and ignores file shortcuts while filter is focused", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: false,
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);
    let transferRequestCount = 0;
    const onRequest = (request: { url: () => string }) => {
      if (request.url().includes("/transferFileBrowserEntry")) {
        transferRequestCount += 1;
      }
    };
    page.on("request", onRequest);

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

      const fileName = "pw-transfer-file.txt";
      const sourceFilePath = path.join(rootPath, fileName);
      await fs.writeFile(sourceFilePath, "transfer", "utf-8");
      const sourceFolderName = "pw-transfer-folder";
      const sourceFolderPath = path.join(rootPath, sourceFolderName);
      const nestedFileName = "pw-transfer-nested.txt";
      await fs.mkdir(sourceFolderPath, { recursive: true });
      await fs.writeFile(
        path.join(sourceFolderPath, nestedFileName),
        "nested",
        "utf-8",
      );
      const destinationFolderName = "pw-transfer-destination";
      const destinationFolderPath = path.join(rootPath, destinationFolderName);
      await fs.mkdir(destinationFolderPath, { recursive: true });

      const viewportBounds = await getViewportBoundsForPlacement(page);
      if (!viewportBounds) {
        throw new Error(
          "Unable to resolve viewport bounds for section placement.",
        );
      }
      const browserSection = await createTopLevelSectionFromFrontend(page, {
        projectConfigId: projectContext.projectConfigId,
        implType: "Browser",
        viewportBounds,
      });
      const sectionId = browserSection?.sectionId;
      if (!sectionId) {
        throw new Error("Missing sectionId when creating browser section.");
      }

      const sectionNode = page.locator(
        `.react-flow__node[data-id="${sectionId}"]`,
      );
      await expect(sectionNode).toBeVisible();
      const pathEditor = sectionNode.locator(
        `[id="CodeMirror-${sectionId}-browser-path"]`,
      );
      await fillCodeMirror(pathEditor, page, rootPath);
      await page.keyboard.press("Enter");

      const sectionFilter = sectionNode
        .locator('[id^="CodeMirror-FileBrowserFilter-"]')
        .first();
      await fillCodeMirror(sectionFilter, page, "pw-transfer-");

      const explorer = sectionNode
        .locator('[role="region"][aria-label="File explorer"]')
        .first();
      const sourceFileRow = explorer
        .locator("button")
        .filter({ hasText: fileName })
        .first();
      const sourceFolderRow = explorer
        .locator("button")
        .filter({ hasText: sourceFolderName })
        .first();
      const destinationFolderRow = explorer
        .locator("button")
        .filter({ hasText: destinationFolderName })
        .first();
      const destinationFolderExpandToggle = destinationFolderRow
        .getByRole("button", { name: /expand folder/i })
        .first();
      const sourceNestedRow = explorer
        .locator("button")
        .filter({ hasText: nestedFileName })
        .first();
      const sourceFolderToggle = sourceFolderRow
        .getByRole("button", { name: /expand folder|collapse folder/i })
        .first();
      await expect(sourceFileRow).toBeVisible({ timeout: 15000 });
      await expect(sourceFolderRow).toBeVisible({ timeout: 15000 });
      await expect(destinationFolderRow).toBeVisible({ timeout: 15000 });
      await sourceFolderToggle.click();
      await expect(sourceNestedRow).toBeVisible({ timeout: 15000 });

      await dragBrowserRowToTarget(sourceFileRow, destinationFolderRow);
      await expect
        .poll(
          async () =>
            await pathExists(path.join(destinationFolderPath, fileName)),
        )
        .toBe(true);
      await expect
        .poll(async () => await pathExists(sourceFilePath))
        .toBe(false);

      await dragBrowserRowToTarget(sourceFolderRow, destinationFolderRow);
      await expect
        .poll(
          async () =>
            await pathExists(
              path.join(destinationFolderPath, sourceFolderName),
            ),
        )
        .toBe(true);
      await expect
        .poll(async () => await pathExists(sourceFolderPath))
        .toBe(false);

      await destinationFolderExpandToggle.click();
      const movedFolderRow = explorer
        .locator("button")
        .filter({ hasText: sourceFolderName })
        .first();
      const movedFileRow = explorer
        .locator("button")
        .filter({ hasText: fileName })
        .first();
      const movedNestedFileRow = explorer
        .locator("button")
        .filter({ hasText: nestedFileName })
        .first();
      await expect(movedFolderRow).toBeVisible({ timeout: 15000 });
      await expect(movedFileRow).toBeVisible({ timeout: 15000 });
      await expect(movedNestedFileRow).toBeVisible({ timeout: 15000 });
      await movedFileRow.click();

      const transferRequestsBeforeFilterShortcuts = transferRequestCount;
      await fillCodeMirror(sectionFilter, page, "pw-transfer");
      await page.keyboard.press(SELECT_ALL_SHORTCUT);
      await page.keyboard.press(COPY_SHORTCUT);
      await page.keyboard.press(PASTE_SHORTCUT);
      await page.waitForTimeout(250);
      expect(transferRequestCount).toBe(transferRequestsBeforeFilterShortcuts);

      await movedFileRow.click();
      const transferRequestsBeforeNoopMove = transferRequestCount;
      await page.keyboard.press(CUT_SHORTCUT);
      await page.keyboard.press(PASTE_SHORTCUT);
      await page.waitForTimeout(250);
      expect(transferRequestCount).toBe(transferRequestsBeforeNoopMove);
    } finally {
      page.off("request", onRequest);
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("transfer endpoint keeps dotfiles extensionless when auto-renaming", async ({
    page,
  }) => {
    await seedLocalStorage(page, {
      overviewTab: "Overview",
      overviewVis: true,
      uiEditorVis: false,
      colorMode: "light",
      darkMode: false,
    });
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

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

      const dotFilePath = path.join(rootPath, ".env");
      const dotCopyPath = path.join(rootPath, ".env copy");
      const dotCopyTwoPath = path.join(rootPath, ".env copy 2");
      await fs.writeFile(dotFilePath, "API_KEY=alpha\n", "utf-8");

      const firstCopy = await postBackend<{ destinationPath?: string }>(
        page,
        "/transferFileBrowserEntry",
        {
          sourcePath: dotFilePath,
          destinationFolderPath: rootPath,
          operation: "copy",
        },
      );
      await expect.poll(async () => await pathExists(dotCopyPath)).toBe(true);
      expect(normalizePathForComparison(firstCopy?.destinationPath ?? "")).toBe(
        normalizePathForComparison(dotCopyPath),
      );

      const secondCopy = await postBackend<{ destinationPath?: string }>(
        page,
        "/transferFileBrowserEntry",
        {
          sourcePath: dotFilePath,
          destinationFolderPath: rootPath,
          operation: "copy",
        },
      );
      await expect
        .poll(async () => await pathExists(dotCopyTwoPath))
        .toBe(true);
      expect(
        normalizePathForComparison(secondCopy?.destinationPath ?? ""),
      ).toBe(normalizePathForComparison(dotCopyTwoPath));

      await expect(fs.readFile(dotCopyPath, "utf-8")).resolves.toBe(
        "API_KEY=alpha\n",
      );
      await expect(fs.readFile(dotCopyTwoPath, "utf-8")).resolves.toBe(
        "API_KEY=alpha\n",
      );
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
});
