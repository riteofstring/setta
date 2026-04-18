import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__sectionSizingPolicy";
const TARGET_PARAM_INFO_ID =
  "settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__metaControlByType__CodeCallable__sizeModeHeight";
const TARGET_ROW_ID = `ParamContainer-${TARGET_SECTION_ID}-${TARGET_PARAM_INFO_ID}`;
const SIZE_MODE_ROW_ID_SUFFIX_RE = /__sizeMode(?:Height|Width)$/;

test("canvas shell path owns section sizing policy size-mode meta-control dropdowns at rest", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allSettingsTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allSettingsTab).toBeVisible();
  await allSettingsTab.click();

  await page.waitForFunction(
    ({ rowId, sectionId }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        ".react-flow__section-shell-backdrop canvas",
      );
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      const row = document.getElementById(rowId);
      return (
        section instanceof HTMLElement &&
        row instanceof HTMLElement &&
        canvas instanceof HTMLCanvasElement &&
        canvas.clientWidth > 0 &&
        canvas.clientHeight > 0 &&
        canvas.width > 0 &&
        canvas.height > 0
      );
    },
    {
      rowId: TARGET_ROW_ID,
      sectionId: TARGET_SECTION_ID,
    },
    { timeout: 15000 },
  );

  const restingState = await page.evaluate(
    ({ rowId, sectionId }) => {
      const section = document.querySelector<HTMLElement>(
        `section[data-section-id="${sectionId}"]`,
      );
      const row = document.getElementById(rowId);
      if (!(section instanceof HTMLElement)) {
        throw new Error(`Missing section ${sectionId}`);
      }
      if (!(row instanceof HTMLElement)) {
        throw new Error(`Missing row ${rowId}`);
      }

      const lightweightRows = Array.from(
        section.querySelectorAll<HTMLElement>('article[id^="ParamContainer-"]'),
      ).filter((candidateRow) =>
        /__sizeMode(?:Height|Width)$/.test(candidateRow.id),
      );
      const familyState = lightweightRows.map((candidateRow) => ({
        buttonCount: candidateRow.querySelectorAll("search button").length,
        inputCount: candidateRow.querySelectorAll("search input").length,
        lightweightFlag:
          candidateRow.querySelector<HTMLElement>(
            '[data-canvas-owned-resting-dropdown-lightweight="true"]',
          )?.dataset.canvasOwnedRestingDropdownLightweight ?? null,
      }));
      const targetLightweightRoot = row.querySelector<HTMLElement>(
        '[data-canvas-owned-resting-dropdown-lightweight="true"]',
      );
      const targetDropdownBox = row.querySelector<HTMLElement>(
        '[data-canvas-owned-resting-dropdown-box="true"]',
      );
      if (!(targetLightweightRoot instanceof HTMLElement)) {
        throw new Error(`Missing lightweight root for ${rowId}`);
      }
      if (!(targetDropdownBox instanceof HTMLElement)) {
        throw new Error(`Missing lightweight box for ${rowId}`);
      }

      return {
        familyRowCount: lightweightRows.length,
        hasLiveSearchButton: row.querySelector("search button") !== null,
        hasLiveSearchInput: row.querySelector("search input") !== null,
        lightweightRootOpacity:
          window.getComputedStyle(targetLightweightRoot).opacity,
        targetBoxOpacity: window.getComputedStyle(targetDropdownBox).opacity,
        familyState,
      };
    },
    {
      rowId: TARGET_ROW_ID,
      sectionId: TARGET_SECTION_ID,
    },
  );

  expect(restingState.familyRowCount).toBeGreaterThan(10);
  expect(
    restingState.familyState.every(
      (rowState) =>
        rowState.lightweightFlag === "true" &&
        rowState.inputCount === 0 &&
        rowState.buttonCount === 0,
    ),
  ).toBe(true);
  expect(restingState.hasLiveSearchInput).toBe(false);
  expect(restingState.hasLiveSearchButton).toBe(false);
  expect(restingState.lightweightRootOpacity).toBe("1");
  expect(restingState.targetBoxOpacity).toBe("0");

  const reframedState = await page.evaluate(async ({ rowId, sectionId }) => {
    const section = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"]`,
    );
    const row = document.getElementById(rowId);
    const lightweightRoot = row?.querySelector<HTMLElement>(
      '[data-canvas-owned-resting-dropdown-lightweight="true"]',
    );
    const node = section?.closest<HTMLElement>(".react-flow__node");
    const viewport = node?.closest<HTMLElement>(".react-flow__viewport");

    if (!(section instanceof HTMLElement)) {
      throw new Error(`Missing section ${sectionId}`);
    }
    if (!(row instanceof HTMLElement)) {
      throw new Error(`Missing row ${rowId}`);
    }
    if (!(lightweightRoot instanceof HTMLElement)) {
      throw new Error(`Missing lightweight root for ${rowId}`);
    }
    if (!(node instanceof HTMLElement)) {
      throw new Error(`Missing React Flow node wrapper for ${sectionId}`);
    }
    if (!(viewport instanceof HTMLElement)) {
      throw new Error(`Missing React Flow viewport for ${sectionId}`);
    }

    const nodeTransform = window.getComputedStyle(node).transform;
    const viewportTransform = window.getComputedStyle(viewport).transform;
    const nodeTransformMatch = /^matrix\(([^)]+)\)$/.exec(nodeTransform);
    const viewportTransformMatch = /^matrix\(([^)]+)\)$/.exec(
      viewportTransform,
    );
    if (!nodeTransformMatch || !viewportTransformMatch) {
      throw new Error(
        `Unexpected transforms for ${sectionId}: ${nodeTransform} / ${viewportTransform}`,
      );
    }

    const nodeMatrixParts = nodeTransformMatch[1]
      .split(",")
      .map((value) => Number.parseFloat(value.trim()));
    const viewportMatrixParts = viewportTransformMatch[1]
      .split(",")
      .map((value) => Number.parseFloat(value.trim()));
    if (
      nodeMatrixParts.length < 6 ||
      viewportMatrixParts.length < 6 ||
      nodeMatrixParts.some((value) => !Number.isFinite(value)) ||
      viewportMatrixParts.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `Invalid transforms for ${sectionId}: ${nodeTransform} / ${viewportTransform}`,
      );
    }

    const viewportScale = viewportMatrixParts[0];
    if (!Number.isFinite(viewportScale) || viewportScale <= 0) {
      throw new Error(`Invalid viewport scale for ${sectionId}`);
    }

    const nodeRect = node.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const rowGraphX =
      nodeMatrixParts[4] + (rowRect.left - nodeRect.left) / viewportScale;
    const rowGraphY =
      nodeMatrixParts[5] + (rowRect.top - nodeRect.top) / viewportScale;
    const rowGraphWidth = rowRect.width / viewportScale;
    const rowGraphHeight = rowRect.height / viewportScale;
    const zoom = 1.4;
    const nextViewportX =
      window.innerWidth / 2 - (rowGraphX + rowGraphWidth / 2) * zoom;
    const nextViewportY =
      window.innerHeight / 2 - (rowGraphY + rowGraphHeight / 2) * zoom;

    viewport.style.transform = `translate(${nextViewportX}px, ${nextViewportY}px) scale(${zoom})`;

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    const reframedRowRect = row.getBoundingClientRect();
    const reframedRootRect = lightweightRoot.getBoundingClientRect();

    return {
      rowHeight: reframedRowRect.height,
      rowWidth: reframedRowRect.width,
      rootHeight: reframedRootRect.height,
      rootWidth: reframedRootRect.width,
    };
  }, {
    rowId: TARGET_ROW_ID,
    sectionId: TARGET_SECTION_ID,
  });

  expect(reframedState.rowWidth).toBeGreaterThan(600);
  expect(reframedState.rowHeight).toBeGreaterThan(20);
  expect(reframedState.rootWidth).toBeGreaterThan(250);
  expect(reframedState.rootHeight).toBeGreaterThan(20);

  await page.evaluate(({ rowId }) => {
    const root = document.querySelector<HTMLElement>(
      `#${rowId} [data-canvas-owned-resting-dropdown-lightweight="true"]`,
    );
    if (!(root instanceof HTMLElement)) {
      throw new Error(`Missing lightweight activator for ${rowId}`);
    }

    root.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
  }, { rowId: TARGET_ROW_ID });

  await page.waitForFunction(
    ({ rowId }) => {
      const row = document.getElementById(rowId);
      if (!(row instanceof HTMLElement)) {
        return false;
      }
      const input = row.querySelector<HTMLInputElement>(
        'search input[placeholder="Search"]',
      );
      const button = row.querySelector<HTMLButtonElement>("search button");
      return (
        input instanceof HTMLInputElement &&
        button instanceof HTMLButtonElement &&
        input.offsetWidth > 0 &&
        button.offsetWidth > 0 &&
        row.querySelector(
          '[data-canvas-owned-resting-dropdown-lightweight="true"]',
        ) === null
      );
    },
    { rowId: TARGET_ROW_ID },
    { timeout: 15000 },
  );

  const liveState = await page.evaluate(({ rowId }) => {
    const row = document.getElementById(rowId);
    if (!(row instanceof HTMLElement)) {
      throw new Error(`Missing row ${rowId}`);
    }

    const input = row.querySelector<HTMLInputElement>(
      'search input[placeholder="Search"]',
    );
    const button = row.querySelector<HTMLButtonElement>("search button");
    if (!(input instanceof HTMLInputElement)) {
      throw new Error(`Missing active search input for ${rowId}`);
    }
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Missing active search button for ${rowId}`);
    }

    return {
      ariaExpanded: input.getAttribute("aria-expanded"),
      buttonExpanded: button.getAttribute("aria-expanded"),
      value: input.value,
    };
  }, { rowId: TARGET_ROW_ID });

  expect(liveState.value.length).toBeGreaterThan(0);
  expect(liveState.ariaExpanded).toBe("true");
  expect(liveState.buttonExpanded).toBe("true");
});

test("section sizing policy keeps repeated inactive controls off the live DOM at rest", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allSettingsTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allSettingsTab).toBeVisible();
  await allSettingsTab.click();

  const summary = await page.evaluate(({ sectionId }) => {
    const section = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"]`,
    );
    if (!(section instanceof HTMLElement)) {
      throw new Error(`Missing section ${sectionId}`);
    }

    const isVisibleInteractiveElement = (element: Element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        computedStyle.display !== "none" &&
        computedStyle.visibility !== "hidden" &&
        computedStyle.opacity !== "0"
      );
    };

    const rows = Array.from(
      section.querySelectorAll<HTMLElement>('article[id^="ParamContainer-"]'),
    );
    const lightweightDropdownRows = Array.from(
      new Set(
        Array.from(
          section.querySelectorAll<HTMLElement>(
            '[data-canvas-owned-resting-dropdown-lightweight="true"]',
          ),
        )
          .map(
            (dropdownRoot) =>
              dropdownRoot.closest<HTMLElement>('article[id^="ParamContainer-"]')
                ?.id ?? null,
          )
          .filter((rowId): rowId is string => rowId !== null),
      ),
    );
    const liveInteractiveRows = rows
      .filter((row) =>
        Array.from(
          row.querySelectorAll(
            'input:not([type="hidden"]), textarea, search input, search button, [role="switch"]',
          ),
        ).some(isVisibleInteractiveElement),
      )
      .map((row) => row.id);

    return {
      legacyNestedChildWrapperCount: section.querySelectorAll(
        ".section-args-nested.section-key-value.relative.grid",
      ).length,
      legacyLeadingContentWrapperCount: section.querySelectorAll(
        '.section-key:not([data-canvas-owned-param-label-lightweight="true"])',
      ).length,
      lightweightNestedGuideRootCount: section.querySelectorAll(
        '[data-canvas-owned-nested-guide-lightweight="true"]',
      ).length,
      lightweightParamLabelCount: section.querySelectorAll(
        '[data-canvas-owned-param-label-lightweight="true"]',
      ).length,
      leadingContentCount: section.querySelectorAll(".section-key").length,
      lightweightResizeHandleCount: section.querySelectorAll(
        '[data-param-resize-handle-lightweight="true"]',
      ).length,
      lightweightResizeHandleChildCount: Array.from(
        section.querySelectorAll<HTMLElement>(
          '[data-param-resize-handle-lightweight="true"]',
        ),
      ).reduce((count, handle) => count + handle.children.length, 0),
      legacyResizeHandleCount: section.querySelectorAll(
        '[data-param-resize-handle="true"]:not([data-param-resize-handle-lightweight="true"])',
      ).length,
      lightweightTextUnderlineCount: section.querySelectorAll(
        '[data-canvas-owned-underline="true"][data-canvas-owned-resting-text-lightweight="true"]',
      ).length,
      legacyTextUnderlineCount: section.querySelectorAll(
        '[data-canvas-owned-underline="true"]:not([data-canvas-owned-resting-text-lightweight="true"])',
      ).length,
      lightweightDropdownRows,
      liveInteractiveRows,
      restingTextRootCount: section.querySelectorAll(
        '[data-canvas-owned-resting-text="true"]',
      ).length,
      rowCount: rows.length,
    };
  }, {
    sectionId: TARGET_SECTION_ID,
  });

  expect(summary.rowCount).toBeGreaterThan(200);
  expect(summary.restingTextRootCount).toBeGreaterThan(150);
  expect(summary.liveInteractiveRows).toEqual([]);
  expect(summary.legacyNestedChildWrapperCount).toBe(0);
  expect(summary.legacyLeadingContentWrapperCount).toBe(0);
  expect(summary.lightweightNestedGuideRootCount).toBeGreaterThan(30);
  expect(summary.lightweightParamLabelCount).toBeGreaterThan(150);
  expect(summary.leadingContentCount).toBe(summary.lightweightParamLabelCount);
  expect(summary.lightweightResizeHandleCount).toBeGreaterThan(150);
  expect(summary.lightweightResizeHandleChildCount).toBe(0);
  expect(summary.legacyResizeHandleCount).toBe(0);
  expect(summary.lightweightTextUnderlineCount).toBeGreaterThan(100);
  expect(summary.legacyTextUnderlineCount).toBe(0);
  expect(summary.lightweightDropdownRows.length).toBeGreaterThan(20);
  expect(
    summary.lightweightDropdownRows.every((rowId) =>
      SIZE_MODE_ROW_ID_SUFFIX_RE.test(rowId),
    ),
  ).toBe(true);
});
