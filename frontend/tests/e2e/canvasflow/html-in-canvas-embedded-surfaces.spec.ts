import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  applyProjectMutationsFromFrontend,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getCurrentProjectConfigId,
  getViewportBoundsForPlacement,
  moveSectionsFromFrontend,
  postBackend,
  setSectionSizesFromFrontend,
} from "../helpers";

const CANVAS_SELECTOR = ".canvas-flow__canvas";
const TOOLTIP_PARENT_SELECTOR = "#setta-codemirror-tooltips";
const AUTOCOMPLETE_SELECTOR = `${TOOLTIP_PARENT_SELECTOR} .cm-tooltip-autocomplete`;
const SELECT_ALL_SHORTCUT =
  process.platform === "darwin" ? "Meta+A" : "Control+A";

type RootResponse = {
  rootPath: string;
};

test("CanvasFlow keeps embedded node surfaces interactive through zoom", async ({
  page,
}) => {
  test.setTimeout(120000);
  await ensureAppReady(page);
  await forceCanvasFlowZoomOnWheel(page);

  const projectConfigId = await getCurrentProjectConfigId(page);
  const viewportBounds = await getViewportBoundsForPlacement(page);
  if (!viewportBounds) {
    throw new Error("Unable to resolve CanvasFlow viewport bounds.");
  }

  const root = await postBackend<RootResponse>(page, "/getFileBrowserRoot", {});
  if (!root?.rootPath) {
    throw new Error("Missing file browser root path.");
  }
  const csvPath = path.join(root.rootPath, "canvas-flow-embedded.csv");
  await fs.writeFile(csvPath, "task,status\nalpha,todo\nbeta,done\n", "utf-8");

  const createdSectionIds: string[] = [];
  const createSection = async (
    implType: string,
    position: { x: number; y: number },
    implOverrides: Record<string, unknown> | null = null,
  ) => {
    const response = await createTopLevelSectionFromFrontend(page, {
      projectConfigId,
      implType,
      implOverrides,
      position,
      viewportBounds,
    });
    const sectionId = response?.sectionId;
    if (!sectionId) {
      throw new Error(`Missing created section id for ${implType}.`);
    }
    createdSectionIds.push(sectionId);
    return sectionId;
  };

  try {
    const codeSectionId = await createSection("Code", {
      x: viewportBounds.x + 40,
      y: viewportBounds.y + 40,
    });
    const terminalSectionId = await createSection("Terminal", {
      x: viewportBounds.x + 440,
      y: viewportBounds.y + 40,
    });
    const spreadsheetSectionId = await createSection("Spreadsheet", {
      x: viewportBounds.x + 40,
      y: viewportBounds.y + 360,
    });
    const browserSectionId = await createSection("Browser", {
      x: viewportBounds.x + 560,
      y: viewportBounds.y + 360,
    });
    const iframeSectionId = await createSection(
      "IFrame",
      {
        x: viewportBounds.x + 960,
        y: viewportBounds.y + 40,
      },
      {
        type: "IFrame",
        code: "<iframe title='canvas-flow-iframe' srcdoc='<button>iframe ready</button>'></iframe>",
      },
    );
    const groupSectionId = await createSection("Group", {
      x: viewportBounds.x + 960,
      y: viewportBounds.y + 360,
    });
    const childSectionId = await createSection("TextBlock", {
      x: viewportBounds.x + 980,
      y: viewportBounds.y + 380,
    });

    await setSectionSizesFromFrontend(page, {
      projectConfigId,
      sectionSizes: {
        [codeSectionId]: { width: 340, height: 150 },
        [terminalSectionId]: { width: 420, height: 260 },
        [spreadsheetSectionId]: { width: 480, height: 340 },
        [browserSectionId]: { width: 520, height: 340 },
        [iframeSectionId]: { width: 360, height: 260 },
        [groupSectionId]: { width: 360, height: 300 },
      },
    });
    await applyProjectMutationsFromFrontend(page, {
      projectConfigId,
      operations: [
        {
          operationName: "setSpreadsheetFilePath",
          body: {
            sectionId: spreadsheetSectionId,
            filePath: csvPath,
            activeSheet: null,
            frontendOpId: null,
          },
        },
      ],
    });
    await moveSectionsFromFrontend(page, {
      projectConfigId,
      sectionIds: [childSectionId],
      newParentId: groupSectionId,
      newIndex: 0,
      positionsById: null,
    });

    await expect(page.locator(CANVAS_SELECTOR)).toBeVisible();
    await expect(page.locator(".react-flow__viewport")).toHaveCount(0);
    await expect(page.locator("svg.react-flow__edges")).toHaveCount(0);

    const codeNode = canvasNode(page, codeSectionId);
    const terminalNode = canvasNode(page, terminalSectionId);
    const spreadsheetNode = canvasNode(page, spreadsheetSectionId);
    const browserNode = canvasNode(page, browserSectionId);
    const iframeNode = canvasNode(page, iframeSectionId);
    const groupNode = canvasNode(page, groupSectionId);

    await expect(codeNode).toBeVisible();
    await expect(terminalNode).toBeVisible();
    await expect(spreadsheetNode).toBeVisible();
    await expect(browserNode).toBeVisible();
    await expect(iframeNode).toBeVisible();
    await expect(groupNode).toBeVisible();

    await expect(terminalNode.locator(".xterm").first()).toBeVisible({
      timeout: 30000,
    });
    await expect(
      spreadsheetNode.getByTestId("spreadsheet-add-row"),
    ).toBeVisible();
    await expect(spreadsheetNode.getByTestId("spreadsheet-save")).toBeVisible();
    await expect(
      browserNode
        .locator('[role="region"][aria-label="File explorer"]')
        .first(),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      iframeNode.locator('iframe[title="canvas-flow-iframe"]'),
    ).toBeVisible();
    await expect(
      groupNode.locator(`section[data-section-id="${childSectionId}"]`),
    ).toBeVisible();

    await openCodeMirrorAutocomplete(page, codeSectionId);
    const tooltipBefore = await getElementRect(page, AUTOCOMPLETE_SELECTOR);
    const codeNodeTransformBefore = await codeNode.evaluate(
      (node) => getComputedStyle(node).transform,
    );

    const wheelResult = await dispatchCanvasWheelZoom(page);
    expect(wheelResult.defaultPrevented).toBe(true);
    await expect
      .poll(async () => {
        const zoom = await getCanvasDatasetNumber(page, "viewportZoom");
        return Math.abs(zoom - wheelResult.beforeZoom) > 0.0001;
      })
      .toBe(true);

    await expect(page.locator(AUTOCOMPLETE_SELECTOR)).toBeVisible();
    const codeNodeTransformAfter = await codeNode.evaluate(
      (node) => getComputedStyle(node).transform,
    );
    expect(codeNodeTransformAfter).not.toBe(codeNodeTransformBefore);
    await expect
      .poll(async () => {
        const tooltipAfter = await getElementRect(page, AUTOCOMPLETE_SELECTOR);
        return Math.abs(tooltipAfter.left - tooltipBefore.left) > 1;
      })
      .toBe(true);

    await expect(terminalNode.locator(".xterm").first()).toBeVisible();
    await expect(
      spreadsheetNode.getByTestId("spreadsheet-add-row"),
    ).toBeVisible();
    await expect(
      iframeNode.locator('iframe[title="canvas-flow-iframe"]'),
    ).toBeVisible();

    const paintStats = await page
      .locator(CANVAS_SELECTOR)
      .evaluate((canvas) => ({
        drawnNodes: Number(
          (canvas as HTMLCanvasElement).dataset.drawnNodes ?? 0,
        ),
        registeredNodes: Number(
          (canvas as HTMLCanvasElement).dataset.registeredNodes ?? 0,
        ),
        totalPaintMs: Number(
          (canvas as HTMLCanvasElement).dataset.totalPaintMs ?? 0,
        ),
      }));
    expect(paintStats.registeredNodes).toBeGreaterThanOrEqual(6);
    expect(paintStats.drawnNodes).toBeGreaterThan(0);
    expect(paintStats.totalPaintMs).toBeGreaterThanOrEqual(0);
  } finally {
    if (createdSectionIds.length > 0) {
      await postBackend(page, "/deleteSections", {
        projectConfigId,
        sectionIds: createdSectionIds,
      });
    }
  }
});

function canvasNode(page: Page, sectionId: string) {
  return page.locator(`.canvas-flow__node[data-id="${sectionId}"]`);
}

async function forceCanvasFlowZoomOnWheel(page: Page) {
  await page.evaluate(async () => {
    const { useSettings } = await import("/src/state/definitions.ts");
    useSettings.setState((state) => ({
      gui: {
        ...state.gui,
        panOnScroll: false,
        zoomOnScroll: true,
      },
    }));
  });
}

async function openCodeMirrorAutocomplete(page: Page, sectionId: string) {
  const codeMirror = canvasNode(page, sectionId).locator(
    "[data-section-main-editor] .cm-content",
  );
  await expect(codeMirror).toBeVisible();
  await codeMirror.click();
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await page.keyboard.type("str.");
  const completionResponse = page.waitForResponse(
    (response) => response.url().includes("/api/codeAreaCompletion"),
    { timeout: 15000 },
  );
  await page.keyboard.press("Control+Space");
  await completionResponse;
  await expect(page.locator(AUTOCOMPLETE_SELECTOR)).toBeVisible({
    timeout: 15000,
  });
}

async function dispatchCanvasWheelZoom(page: Page) {
  return page.evaluate(async (selector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    if (!canvas) {
      throw new Error("Missing CanvasFlow canvas.");
    }
    const rect = canvas.getBoundingClientRect();
    const beforeZoom = Number.parseFloat(canvas.dataset.viewportZoom ?? "1");
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      deltaY: -160,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
    });
    canvas.dispatchEvent(event);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return {
      beforeZoom,
      defaultPrevented: event.defaultPrevented,
      afterZoom: Number.parseFloat(canvas.dataset.viewportZoom ?? "1"),
    };
  }, CANVAS_SELECTOR);
}

async function getElementRect(page: Page, selector: string) {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  });
}

async function getCanvasDatasetNumber(page: Page, key: string) {
  return page.locator(CANVAS_SELECTOR).evaluate((canvas, datasetKey) => {
    return Number.parseFloat(
      (canvas as HTMLCanvasElement).dataset[datasetKey as string] ?? "NaN",
    );
  }, key);
}
