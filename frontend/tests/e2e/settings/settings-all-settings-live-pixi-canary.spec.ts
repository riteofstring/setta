import { expect, test, type Locator, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL);
const READY_SELECTOR = ".react-flow__pane";
const LIVE_DICT_AREA_RENDERER_STORAGE_KEY = "setta.liveDictAreaRendererMode";
const LIVE_DICT_AREA_INTERACTION_MODE_QUERY_PARAM =
  "liveDictAreaInteractionMode";
const LIVE_PIXI_MODE = "pixi-node-body";

type DragOverlayRow = {
  height: number;
  id: string;
  top: number;
};

async function openAllSettingsLivePixiCanary(
  page: Page,
  options?: {
    interactionMode?: "param-select";
  },
) {
  await ensureAppReady(page);

  await page.addInitScript(
    ({ mode, storageKey }) => {
      window.sessionStorage.setItem(storageKey, mode);
    },
    {
      mode: LIVE_PIXI_MODE,
      storageKey: LIVE_DICT_AREA_RENDERER_STORAGE_KEY,
    },
  );

  const url = new URL(SETTINGS_URL);
  if (options?.interactionMode) {
    url.searchParams.set(
      LIVE_DICT_AREA_INTERACTION_MODE_QUERY_PARAM,
      options.interactionMode,
    );
  }
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allSettingsTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allSettingsTab).toBeVisible();
  await allSettingsTab.click();
}

async function withParamSelectHeld(page: Page, callback: () => Promise<void>) {
  const modifierKey = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.down(modifierKey);
  await page.keyboard.down("Shift");

  try {
    await callback();
  } finally {
    await page.keyboard.up("Shift");
    await page.keyboard.up(modifierKey);
  }
}

async function dragLocatorBefore(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("Missing drag source or target bounds.");
  }

  await page.mouse.move(
    sourceBox.x + Math.max(12, sourceBox.width * 0.18),
    sourceBox.y + Math.max(10, sourceBox.height * 0.2),
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + Math.max(12, targetBox.width * 0.18),
    targetBox.y + Math.max(6, targetBox.height * 0.15),
    { steps: 40 },
  );
  await page.mouse.up();
}

async function readActiveOverlayTopLevelRows(
  page: Page,
  blockId: string,
): Promise<DragOverlayRow[]> {
  return page.evaluate((activeBlockId) => {
    const overlay = document.querySelector<HTMLElement>(
      `[data-live-dict-area-drag-overlay='active'][data-live-dict-area-drag-overlay-block-id='${activeBlockId}']`,
    );
    if (!overlay) {
      return [];
    }

    const rows = Array.from(
      overlay.querySelectorAll<HTMLElement>(
        "[data-live-dict-area-drag-overlay-row='true'][data-live-dict-area-scene-row-depth='0']",
      ),
    )
      .map((row) => {
        const rect = row.getBoundingClientRect();
        return {
          height: rect.height,
          id: row.getAttribute("data-live-dict-area-drag-overlay-row-id") ?? "",
          top: rect.top,
        };
      })
      .sort((a, b) => a.top - b.top);

    return rows;
  }, blockId);
}

test("all settings canary can replace the live dict-area body with a Pixi scene host", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const metrics = await page.waitForFunction(() => {
    const sceneRoot = document.querySelector<HTMLElement>(
      "[data-live-dict-area-render-mode='pixi-node-body']",
    );
    if (!sceneRoot) {
      return null;
    }
    const sceneHost = sceneRoot.querySelector<HTMLElement>(
      "[data-live-dict-area-scene='pixi']",
    );
    const sceneCanvas = sceneHost?.querySelector("canvas");
    if (!sceneHost || !sceneCanvas) {
      return null;
    }

    return {
      localParamContainerCount: sceneRoot.querySelectorAll(
        '[id^="ParamContainer-"]',
      ).length,
      rowCount: Number.parseInt(
        sceneHost.getAttribute("data-live-dict-area-scene-row-count") ?? "0",
        10,
      ),
      sceneBlockCount: Number.parseInt(
        sceneHost.getAttribute("data-live-dict-area-scene-block-count") ?? "0",
        10,
      ),
    };
  });

  const result = await metrics.jsonValue();

  expect(result).not.toBeNull();
  expect(result?.sceneBlockCount).toBeGreaterThan(0);
  expect(result?.rowCount).toBeGreaterThan(0);
  expect(result?.localParamContainerCount).toBe(0);
});

test("all settings canary can hand off from the Pixi scene into a value-row DOM editor overlay", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const handoffButton = page
    .locator("[data-live-dict-area-editor-handoff='value-row']")
    .first();
  await expect(handoffButton).toBeVisible();
  const activatedRowId = await handoffButton.getAttribute(
    "data-live-dict-area-editor-handoff-row-id",
  );
  expect(activatedRowId).not.toBeNull();
  await handoffButton.click();

  await page.waitForSelector(
    `[data-live-dict-area-editor-overlay='active'][data-live-dict-area-editor-overlay-row-id='${activatedRowId}']`,
  );

  const overlayMetrics = await page.waitForFunction((rowId) => {
    const overlay = document.querySelector<HTMLElement>(
      `[data-live-dict-area-editor-overlay='active'][data-live-dict-area-editor-overlay-row-id='${rowId}']`,
    );
    if (!overlay) {
      return null;
    }

    return {
      localParamContainerCount: overlay.querySelectorAll(
        '[id^="ParamContainer-"]',
      ).length,
      sceneCanvasCount: document.querySelectorAll(
        "[data-live-dict-area-scene='pixi'] canvas",
      ).length,
    };
  }, activatedRowId);

  const result = await overlayMetrics.jsonValue();

  expect(result).not.toBeNull();
  expect(result?.localParamContainerCount).toBe(1);
  expect(result?.sceneCanvasCount).toBeGreaterThan(0);
});

test("all settings canary can immediately activate a CodeMirror-backed value row on first Pixi handoff click", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const handoffButtons = page.locator(
    "[data-live-dict-area-editor-handoff='value-row']",
  );
  const handoffButtonCount = await handoffButtons.count();
  expect(handoffButtonCount).toBeGreaterThan(0);

  let codemirrorActivationResult: {
    activeElementInsideCodeMirror: boolean;
    editorKind: string | null;
    hasCodeMirrorEditor: boolean;
  } | null = null;

  for (let i = 0; i < handoffButtonCount; i += 1) {
    const handoffButton = handoffButtons.nth(i);
    await handoffButton.scrollIntoViewIfNeeded();
    await handoffButton.click();

    const activationMetrics = await page.waitForFunction(() => {
      const overlay = document.querySelector<HTMLElement>(
        "[data-live-dict-area-editor-overlay='active']",
      );
      if (!overlay) {
        return null;
      }

      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      return {
        activeElementInsideCodeMirror: Boolean(
          activeElement?.closest(".cm-editor"),
        ),
        editorKind: overlay.getAttribute(
          "data-live-dict-area-editor-overlay-editor-kind",
        ),
        hasCodeMirrorEditor: Boolean(overlay.querySelector(".cm-editor")),
      };
    });

    const result = await activationMetrics.jsonValue();
    if (result?.editorKind === "codemirror") {
      codemirrorActivationResult = result;
      break;
    }
  }

  expect(codemirrorActivationResult).not.toBeNull();
  expect(codemirrorActivationResult?.hasCodeMirrorEditor).toBe(true);
  expect(codemirrorActivationResult?.activeElementInsideCodeMirror).toBe(true);
});

test("all settings canary can immediately open a combobox-backed value row on first Pixi handoff click", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const handoffButton = page
    .locator(
      "[data-live-dict-area-editor-handoff='value-row'][data-live-dict-area-editor-handoff-editor-kind='combobox']",
    )
    .first();
  await expect(handoffButton).toBeVisible();
  await handoffButton.click();

  const activationMetrics = await page.waitForFunction(() => {
    const overlay = document.querySelector<HTMLElement>(
      "[data-live-dict-area-editor-overlay='active']",
    );
    if (!overlay) {
      return null;
    }

    const visibleMenu = Array.from(
      document.body.querySelectorAll<HTMLDivElement>("div.nowheel.nodrag"),
    ).find((menu) => getComputedStyle(menu).display !== "none");
    const comboboxInput = overlay.querySelector<HTMLInputElement>("input");

    return {
      activeElementInsideComboboxInput:
        comboboxInput !== null && document.activeElement === comboboxInput,
      editorKind: overlay.getAttribute(
        "data-live-dict-area-editor-overlay-editor-kind",
      ),
      openMenuItemCount: visibleMenu?.querySelectorAll("dd").length ?? 0,
    };
  });

  const comboboxActivationResult = await activationMetrics.jsonValue();

  expect(comboboxActivationResult).not.toBeNull();
  expect(comboboxActivationResult?.editorKind).toBe("combobox");
  expect(comboboxActivationResult?.activeElementInsideComboboxInput).toBe(true);
  expect(comboboxActivationResult?.openMenuItemCount).toBeGreaterThan(0);
});

test("all settings canary can immediately open a popup color-picker row on first Pixi handoff click", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const handoffButton = page
    .locator(
      "[data-live-dict-area-editor-handoff='value-row'][data-live-dict-area-editor-handoff-editor-kind='color-picker']",
    )
    .first();
  await handoffButton.scrollIntoViewIfNeeded();
  await expect(handoffButton).toBeVisible();
  await handoffButton.click();

  const activationMetrics = await page.waitForFunction(() => {
    const overlay = document.querySelector<HTMLElement>(
      "[data-live-dict-area-editor-overlay='active']",
    );
    if (!overlay) {
      return null;
    }

    const paletteLabels = new Set([
      "Red",
      "Orange",
      "Yellow",
      "Green",
      "Cyan",
      "Blue",
      "Purple",
      "Slate",
    ]);
    const visibleMenuItems = Array.from(
      document.body.querySelectorAll<HTMLElement>("[role='menuitem']"),
    ).filter((item) => {
      const style = getComputedStyle(item);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    const visiblePaletteLabels = visibleMenuItems
      .map((item) => item.textContent?.trim() ?? "")
      .filter((label) => paletteLabels.has(label));

    return {
      editorKind: overlay.getAttribute(
        "data-live-dict-area-editor-overlay-editor-kind",
      ),
      openPaletteItemCount: visiblePaletteLabels.length,
      visiblePaletteLabels,
    };
  });

  const colorPickerActivationResult = await activationMetrics.jsonValue();

  expect(colorPickerActivationResult).not.toBeNull();
  expect(colorPickerActivationResult?.editorKind).toBe("color-picker");
  expect(colorPickerActivationResult?.openPaletteItemCount).toBeGreaterThan(0);
  expect(colorPickerActivationResult?.visiblePaletteLabels).toContain("Red");
});

test("all settings canary can opt into param-select mode through the canary query param for drag-overlay inspection", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page, {
    interactionMode: "param-select",
  });

  const dragHandoffButton = page
    .locator("[data-live-dict-area-drag-handoff='param-row']")
    .first();
  await expect(dragHandoffButton).toBeVisible();
  const activatedBlockId = await dragHandoffButton.getAttribute(
    "data-live-dict-area-drag-handoff-block-id",
  );
  expect(activatedBlockId).not.toBeNull();

  await dragHandoffButton.click();

  await page.waitForSelector(
    `[data-live-dict-area-drag-overlay='active'][data-live-dict-area-drag-overlay-block-id='${activatedBlockId}']`,
  );

  const dragOverlayMetrics = await page.waitForFunction((blockId) => {
    const overlay = document.querySelector<HTMLElement>(
      `[data-live-dict-area-drag-overlay='active'][data-live-dict-area-drag-overlay-block-id='${blockId}']`,
    );
    if (!overlay) {
      return null;
    }

    return {
      dragOverlayKind: overlay.getAttribute(
        "data-live-dict-area-drag-overlay-kind",
      ),
      dragOverlayRowRenderModeCount: overlay.querySelectorAll(
        "[data-param-render-mode='drag-overlay']",
      ).length,
      dragParamRowCount: overlay.querySelectorAll("[data-param-row='true']")
        .length,
      interactiveControlCount: overlay.querySelectorAll(
        "input, textarea, [role='combobox'], .cm-editor",
      ).length,
      sceneCanvasCount: document.querySelectorAll(
        "[data-live-dict-area-scene='pixi'] canvas",
      ).length,
    };
  }, activatedBlockId);

  const result = await dragOverlayMetrics.jsonValue();

  expect(result).not.toBeNull();
  expect(result?.dragOverlayKind).toBe("param-list");
  expect(result?.dragOverlayRowRenderModeCount).toBeGreaterThan(0);
  expect(result?.dragParamRowCount).toBeGreaterThan(1);
  expect(result?.interactiveControlCount).toBe(0);
  expect(result?.sceneCanvasCount).toBeGreaterThan(0);
});

test("all settings canary can hand off from the Pixi scene into a param-list drag overlay while param select is active", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  await withParamSelectHeld(page, async () => {
    const dragHandoffButton = page
      .locator("[data-live-dict-area-drag-handoff='param-row']")
      .first();
    await expect(dragHandoffButton).toBeVisible();
    const activatedRowId = await dragHandoffButton.getAttribute(
      "data-live-dict-area-drag-handoff-row-id",
    );
    const activatedBlockId = await dragHandoffButton.getAttribute(
      "data-live-dict-area-drag-handoff-block-id",
    );
    expect(activatedRowId).not.toBeNull();
    expect(activatedBlockId).not.toBeNull();

    await dragHandoffButton.click();

    await page.waitForSelector(
      `[data-live-dict-area-drag-overlay='active'][data-live-dict-area-drag-overlay-block-id='${activatedBlockId}']`,
    );

    const dragOverlayMetrics = await page.waitForFunction((blockId) => {
      const overlay = document.querySelector<HTMLElement>(
        `[data-live-dict-area-drag-overlay='active'][data-live-dict-area-drag-overlay-block-id='${blockId}']`,
      );
      if (!overlay) {
        return null;
      }

      return {
        dragOverlayKind: overlay.getAttribute(
          "data-live-dict-area-drag-overlay-kind",
        ),
        dragOverlayRowRenderModeCount: overlay.querySelectorAll(
          "[data-param-render-mode='drag-overlay']",
        ).length,
        dragParamRowCount: overlay.querySelectorAll("[data-param-row='true']")
          .length,
        hasBlockFrameMount:
          overlay.querySelector("[data-dict-area-block-frame-id]") !== null,
        hasHeaderMount: overlay.querySelector("header") !== null,
        interactiveControlCount: overlay.querySelectorAll(
          "input, textarea, [role='combobox'], .cm-editor",
        ).length,
        mountedParamContainerCount: overlay.querySelectorAll(
          '[id^="ParamContainer-"]',
        ).length,
        sceneCanvasCount: document.querySelectorAll(
          "[data-live-dict-area-scene='pixi'] canvas",
        ).length,
      };
    }, activatedBlockId);

    const result = await dragOverlayMetrics.jsonValue();

    expect(result).not.toBeNull();
    expect(result?.dragOverlayKind).toBe("param-list");
    expect(result?.dragOverlayRowRenderModeCount).toBeGreaterThan(0);
    expect(result?.dragParamRowCount).toBeGreaterThan(1);
    expect(result?.hasBlockFrameMount).toBe(false);
    expect(result?.hasHeaderMount).toBe(false);
    expect(result?.interactiveControlCount).toBe(0);
    expect(result?.mountedParamContainerCount).toBe(0);
    expect(result?.sceneCanvasCount).toBeGreaterThan(0);
  });
});

test("all settings canary can reorder top-level rows through the Pixi param-list drag overlay", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  let activatedBlockId: string | null = null;
  let reorderedRowIds: string[] | null = null;
  let sourceRowId: string | null = null;
  let targetRowId: string | null = null;

  await withParamSelectHeld(page, async () => {
    const dragHandoffButton = page
      .locator("[data-live-dict-area-drag-handoff='param-row']")
      .first();
    await expect(dragHandoffButton).toBeVisible();
    activatedBlockId = await dragHandoffButton.getAttribute(
      "data-live-dict-area-drag-handoff-block-id",
    );
    expect(activatedBlockId).not.toBeNull();

    await dragHandoffButton.click();
    await page.waitForSelector(
      `[data-live-dict-area-drag-overlay='active'][data-live-dict-area-drag-overlay-block-id='${activatedBlockId}']`,
    );

    const initialRows = await readActiveOverlayTopLevelRows(
      page,
      activatedBlockId!,
    );
    expect(initialRows.length).toBeGreaterThan(1);
    const initialRowIds = initialRows.map((row) => row.id);

    const preferredRows = initialRows.filter((row) => row.height <= 56);
    const draggableRows =
      preferredRows.length >= 2 ? preferredRows : initialRows;

    targetRowId = draggableRows[0]?.id ?? null;
    sourceRowId = draggableRows[1]?.id ?? null;
    expect(targetRowId).not.toBeNull();
    expect(sourceRowId).not.toBeNull();

    const activeOverlay = page.locator(
      `[data-live-dict-area-drag-overlay='active'][data-live-dict-area-drag-overlay-block-id='${activatedBlockId}']`,
    );
    const targetRow = activeOverlay
      .locator(
        `[data-live-dict-area-drag-overlay-row-id='${targetRowId}'][data-live-dict-area-scene-row-depth='0']`,
      )
      .first();
    const sourceRow = activeOverlay
      .locator(
        `[data-live-dict-area-drag-overlay-row-id='${sourceRowId}'][data-live-dict-area-scene-row-depth='0']`,
      )
      .first();
    await targetRow.scrollIntoViewIfNeeded();
    await sourceRow.scrollIntoViewIfNeeded();
    await expect(targetRow).toBeVisible();
    await expect(sourceRow).toBeVisible();

    await dragLocatorBefore(page, sourceRow, targetRow);

    await expect
      .poll(async () => {
        const rowIds = (
          await readActiveOverlayTopLevelRows(page, activatedBlockId!)
        ).map((row) => row.id);
        return rowIds.join("|") !== initialRowIds.join("|");
      })
      .toBe(true);

    reorderedRowIds = (
      await readActiveOverlayTopLevelRows(page, activatedBlockId!)
    ).map((row) => row.id);
  });

  expect(activatedBlockId).not.toBeNull();
  expect(reorderedRowIds).not.toBeNull();
  expect(sourceRowId).not.toBeNull();
  expect(targetRowId).not.toBeNull();

  await withParamSelectHeld(page, async () => {
    const sameBlockHandoff = page
      .locator(
        `[data-live-dict-area-drag-handoff='param-row'][data-live-dict-area-drag-handoff-block-id='${activatedBlockId}']`,
      )
      .first();
    await expect(sameBlockHandoff).toBeVisible();
    await sameBlockHandoff.click();

    await page.waitForSelector(
      `[data-live-dict-area-drag-overlay='active'][data-live-dict-area-drag-overlay-block-id='${activatedBlockId}']`,
    );

    const reopenedRowIds = (
      await readActiveOverlayTopLevelRows(page, activatedBlockId!)
    ).map((row) => row.id);

    expect(reopenedRowIds).toEqual(reorderedRowIds!);
  });
});
