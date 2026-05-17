import { expect, test, type Locator, type Page } from "@playwright/test";
import path from "node:path";

import { expectScopedAxeClean } from "../axeHelpers";
import {
  installGpuFlowPerformanceProbe,
  readGpuFlowPerformanceSummary,
  resetGpuFlowPerformanceProbe,
} from "../gpuFlowPerformanceProbe";
import {
  applyProjectMutationsFromFrontend,
  changeParamImplFromFrontend,
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
  seedLocalStorage,
  setCallableFromFrontend,
  setCodeObjNameFromFrontend,
  setParamEnteredValueFromFrontend,
  setSectionSizesFromFrontend,
} from "../helpers";
import {
  installRetainedDiagnosticsProbe,
  percentile,
  readRetainedDiagnostics,
} from "./html-canvas-library-adoption-helpers";

type RetainedRowTarget = {
  readonly clientPoint: { readonly x: number; readonly y: number };
  readonly rowId: string;
  readonly rowRect: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly surfaceId: string;
};

const TARGET_CALLABLE = "open";
const GPU_PANE_SELECTOR = ".setta-gpu-flow__pane";
const SEARCH_INPUT_SELECTOR = "#ProjectPageSearchBar";
const DOM_ISLAND_TEST_PARAM_TYPES = [
  { impl: "TextParam", name: "canvas_text" },
  { impl: "TextAreaParam", name: "canvas_notes" },
  { impl: "PasswordParam", name: "canvas_secret" },
  { impl: "DateParam", name: "canvas_date" },
  { impl: "TimeParam", name: "canvas_time" },
] as const;
const DROPZONE_TEST_PARAM_TYPE = {
  impl: "DropzoneParam",
  name: "canvas_upload",
} as const;
const TEST_PARAM_TYPES = [
  { impl: "TextParam", name: "canvas_text" },
  { impl: "TextAreaParam", name: "canvas_notes" },
  { impl: "TimeParam", name: "canvas_time" },
  { impl: "SliderParam", name: "canvas_amount" },
  { impl: "DropdownParam", name: "canvas_choice" },
  { impl: "PasswordParam", name: "canvas_secret" },
  { impl: "DateParam", name: "canvas_date" },
  DROPZONE_TEST_PARAM_TYPE,
] as const;
const SCAN_BACKED_TEST_PARAM_TYPES = [
  ...TEST_PARAM_TYPES,
  ...Array.from({ length: 24 }, (_, index) => ({
    impl: "TextParam",
    name: `canvas_extra_${index + 1}`,
  })),
];

for (const theme of [
  { colorMode: "light", darkMode: false },
  { colorMode: "dark", darkMode: true },
] as const) {
  test(`canvas popup placement remains usable in ${theme.colorMode} mode`, async ({
    page,
  }) => {
    await seedLocalStorage(page, theme);
    await installGpuFlowPerformanceProbe(page);
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      await waitForGpuTextureUploadQuiet(page);
      await resetGpuFlowPerformanceProbe(page);
      const beforePanZoom = await readGpuViewportTransform(page);
      await performCanvasPanAndZoom(page);
      const afterPanZoom = await readGpuViewportTransform(page);
      const panZoomPerfSummary = await readGpuFlowPerformanceSummary(page);
      expect(afterPanZoom).not.toEqual(beforePanZoom);
      expect(panZoomPerfSummary.queue.activeTextureUploads).toBe(0);

      const searchInput = await openCommandPaletteCombobox(page);
      await expect(searchInput).toBeVisible();
      await searchInput.fill("code");
      const listbox = page.locator('[role="listbox"]').first();
      await expect(listbox).toBeVisible();
      await expectFloatingBoxInsideViewport(page, listbox);
      await expectScopedAxeClean(page, { include: '[role="listbox"]' });
      await searchInput.press("Escape");
      await expect(listbox).not.toBeVisible();
      const panePoint = await getEmptyPanePoint(page);
      await page.mouse.click(panePoint.x, panePoint.y);

      await assertContextMenuAtViewportEdges(page);
      await selectContextMenuItemWithKeyboard(page);
      await selectContextMenuItemWithPointer(page);
      await expect(page.getByTestId("context-menu-core")).toHaveCount(0);

      const beforePan = await readGpuViewportTransform(page);
      await performCanvasPan(page);
      const afterPan = await readGpuViewportTransform(page);
      expect(afterPan).not.toEqual(beforePan);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
}

test("retained DOM controls and islands pass scoped axe and return ownership to the canvas", async ({
  page,
}) => {
  await installRetainedDiagnosticsProbe(page);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const projectConfigId = projectContext.projectConfigId;
  const sectionId = await createCallableSection(page, projectConfigId, {
    position: { x: 120, y: 120 },
  });
  const dropzoneSectionId = await createCallableSection(page, projectConfigId, {
    position: { x: -260, y: 120 },
  });

  try {
    await setCallable(page, projectConfigId, sectionId);
    await setCallable(page, projectConfigId, dropzoneSectionId);
    const paramIds = await createAdoptionTestParams(page, {
      paramTypes: DOM_ISLAND_TEST_PARAM_TYPES,
      projectConfigId,
      sectionId,
    });
    const dropzoneParamIds = await createAdoptionTestParams(page, {
      paramTypes: [DROPZONE_TEST_PARAM_TYPE],
      projectConfigId,
      sectionId: dropzoneSectionId,
    });
    await setSectionSizesFromFrontend(page, {
      projectConfigId,
      sectionSizes: {
        [sectionId]: { height: 1040, width: 560 },
        [dropzoneSectionId]: { height: 760, width: 360 },
      },
    });
    await setParamEnteredValueFromFrontend(page, {
      projectConfigId,
      sectionId,
      paramInfoId: paramIds.canvas_secret,
      value: "stored-secret",
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(GPU_PANE_SELECTOR)).toBeVisible();

    await activateAndEditTextLikeIsland(page, sectionId, paramIds.canvas_text, {
      selector:
        'input:not([type="hidden"]):not([type="file"]), .cm-content[contenteditable="true"]',
      value: "hello from retained text",
    });
    await activateAndEditTextLikeIsland(
      page,
      sectionId,
      paramIds.canvas_notes,
      {
        selector: 'textarea, .cm-content[contenteditable="true"]',
        value: "line one\nline two",
      },
    );
    await activateAndEditPasswordIsland(
      page,
      sectionId,
      paramIds.canvas_secret,
    );

    await activateAndEditTextLikeIsland(page, sectionId, paramIds.canvas_date, {
      selector: 'input[type="date"], input:not([type="hidden"])',
      value: "2026-05-09",
    });
    await activateAndEditTextLikeIsland(page, sectionId, paramIds.canvas_time, {
      selector: 'input[type="time"], input:not([type="hidden"])',
      value: "09:30",
    });
    await activateDropzoneIsland(
      page,
      dropzoneSectionId,
      dropzoneParamIds.canvas_upload,
    );

    await expectCanvasOwnsFocus(page);
    const diagnostics = await readRetainedDiagnostics(page);
    expect(diagnostics.hitTests.some((sample) => sample.matched)).toBe(true);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("retained hit testing stays scan-backed under realistic retained interactions", async ({
  page,
}) => {
  await installRetainedDiagnosticsProbe(page);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const projectConfigId = projectContext.projectConfigId;
  const sectionId = await createCallableSection(page, projectConfigId, {
    position: { x: 60, y: -160 },
  });

  try {
    await setCallable(page, projectConfigId, sectionId);
    const paramIds = await createAdoptionTestParams(page, {
      paramTypes: SCAN_BACKED_TEST_PARAM_TYPES,
      projectConfigId,
      sectionId,
    });
    await setSectionSizesFromFrontend(page, {
      projectConfigId,
      sectionSizes: {
        [sectionId]: { height: 820, width: 560 },
      },
    });

    await performCanvasPanAndZoom(page);
    await useRetainedSlider(page, "canvas_amount");
    await useRetainedDropdownPopup(page, "canvas_choice");
    await scrollRetainedParameterSurface(page, "canvas_text");
    await dragRetainedParam(page, "canvas_notes", "canvas_time");

    const diagnostics = await readRetainedDiagnostics(page);
    expect(
      diagnostics.pointerEvents.some((event) => event.type === "wheel"),
    ).toBe(true);
    expect(
      diagnostics.pointerEvents.some((event) => event.type === "pointerdown"),
    ).toBe(true);
    expect(diagnostics.sceneBuilds.length).toBeGreaterThan(0);
    expect(diagnostics.hitTests.length).toBeGreaterThan(0);
    expect(
      percentile(
        diagnostics.hitTests.map((sample) => sample.durationMs),
        95,
      ),
    ).toBeLessThan(8);
    expect(
      Math.max(
        ...diagnostics.hitTests.map((sample) => sample.testedHitRecordCount),
      ),
    ).toBeGreaterThan(0);

    const order = await readShownParamIds(page, sectionId);
    expect(order).toContain(paramIds.canvas_notes);
    expect(order).toContain(paramIds.canvas_time);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

async function setCallable(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const response = (await setCallableFromFrontend(page, {
      projectConfigId,
      sectionId,
      callableName: TARGET_CALLABLE,
      refetchParams: false,
    })) as { callableId?: string | null; lspStatus?: string | null } | null;
    if (response?.lspStatus === "matched" && response.callableId) {
      return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error(`Unable to set callable ${TARGET_CALLABLE}.`);
}

async function createAdoptionTestParams(
  page: Page,
  {
    paramTypes = TEST_PARAM_TYPES,
    projectConfigId,
    sectionId,
  }: {
    readonly paramTypes?: readonly {
      readonly impl: string;
      readonly name: string;
    }[];
    readonly projectConfigId: string;
    readonly sectionId: string;
  },
): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const paramType of paramTypes) {
    const beforeIds = await readShownParamIds(page, sectionId);
    await applyProjectMutationsFromFrontend(page, {
      projectConfigId,
      operations: [
        {
          operationName: "addKwarg",
          body: { sectionId },
        },
      ],
    });
    const afterIds = await readShownParamIds(page, sectionId);
    const paramInfoId = findNewParamId(beforeIds, afterIds);
    ids[paramType.name] = paramInfoId;
    await setCodeObjNameFromFrontend(page, {
      projectConfigId,
      codeObjId: paramInfoId,
      name: paramType.name,
    });
    await changeParamImplFromFrontend(page, {
      projectConfigId,
      sectionId,
      paramInfoId,
      selectedId: paramType.impl,
    });
    await configureParam(page, {
      projectConfigId,
      sectionId,
      paramInfoId,
      impl: paramType.impl,
    });
  }
  return ids;
}

async function configureParam(
  page: Page,
  {
    impl,
    paramInfoId,
    projectConfigId,
    sectionId,
  }: {
    readonly impl: string;
    readonly paramInfoId: string;
    readonly projectConfigId: string;
    readonly sectionId: string;
  },
): Promise<void> {
  const newConfigByImpl: Record<string, Record<string, unknown>> = {
    DateParam: {
      dateControlMode: "input",
      dateIncludesTime: false,
    },
    DropzoneParam: {
      mode: "STATEFUL",
      placeholder: "Attach file",
    },
    DropdownParam: {
      choices: ["small", "large"],
    },
    SliderParam: {
      max: 10,
      min: 0,
      step: 1,
    },
    TimeParam: {
      timeControlMode: "input",
    },
  };
  const newConfig = newConfigByImpl[impl];
  if (!newConfig) {
    return;
  }
  await applyProjectMutationsFromFrontend(page, {
    projectConfigId,
    operations: [
      {
        operationName: "updateParamImplConfig",
        body: {
          frontendOpId: null,
          newConfig,
          paramInfoId,
          sectionId,
        },
      },
    ],
  });
}

async function readShownParamIds(
  page: Page,
  sectionId: string,
): Promise<string[]> {
  return await page.evaluate(async (sectionId) => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const state = useProjectState.getState();
    const sectionVariantId = state.projectConfig.sectionVariantMap[sectionId];
    const shown = sectionVariantId
      ? state.shownParamIds[sectionVariantId]
      : null;
    return [
      ...(shown?.pinned?.topLevelParamIds ?? []),
      ...(shown?.unpinned?.topLevelParamIds ?? []),
    ];
  }, sectionId);
}

function findNewParamId(
  beforeIds: readonly string[],
  afterIds: readonly string[],
) {
  const before = new Set(beforeIds);
  const newIds = afterIds.filter((id) => !before.has(id));
  if (newIds.length !== 1 || !newIds[0]) {
    throw new Error(`Expected one new param id, found ${newIds.join(", ")}`);
  }
  return newIds[0];
}

async function activateAndEditTextLikeIsland(
  page: Page,
  sectionId: string,
  paramInfoId: string,
  { selector, value }: { readonly selector: string; readonly value: string },
): Promise<void> {
  const target = await activateRetainedRowControl(page, paramInfoId);
  const container = await resolveActiveRetainedControlContainer(page, {
    paramInfoId,
    sectionId,
    target,
  });
  const island = page.locator(container.selector);
  await expectScopedAxeClean(page, {
    include: container.selector,
  });
  const editor = island.locator(selector).first();
  await expect(editor).toBeVisible();
  await editor.fill(value);
  if (await isFormValueEditor(editor)) {
    await expect(editor).toHaveValue(value);
  } else {
    await expect
      .poll(() => readParamCodeObjValue(page, sectionId, paramInfoId))
      .toBe(value);
  }
  if (container.kind === "dom-control") {
    await dismissActiveDomControl(page, target);
  } else {
    await dismissActiveDomIsland(page);
  }
}

async function resolveActiveRetainedControlContainer(
  page: Page,
  input: {
    readonly paramInfoId: string;
    readonly sectionId: string;
    readonly target: RetainedRowTarget;
  },
): Promise<{
  readonly kind: "dom-control" | "dom-island";
  readonly selector: string;
}> {
  const domControlSelector = activeDomControlHostSelector(input.target);
  const domIslandSelector = `[data-gpu-flow-dom-island-id="param-control:${input.sectionId}:${input.paramInfoId}"]`;
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (
      await page
        .locator(domControlSelector)
        .isVisible()
        .catch(() => false)
    ) {
      return { kind: "dom-control", selector: domControlSelector };
    }
    if (
      await page
        .locator(domIslandSelector)
        .isVisible()
        .catch(() => false)
    ) {
      return { kind: "dom-island", selector: domIslandSelector };
    }
    await page.waitForTimeout(50);
  }
  throw new Error(
    `Missing active retained control container for ${input.paramInfoId}.`,
  );
}

async function isFormValueEditor(locator: Locator): Promise<boolean> {
  return await locator.evaluate(
    (element) =>
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement,
  );
}

async function readParamCodeObjValue(
  page: Page,
  sectionId: string,
  paramInfoId: string,
): Promise<string | null> {
  return await page.evaluate(
    async ({ paramInfoId, sectionId }) => {
      const { useProjectState } = await import("/src/state/definitions.ts");
      const { getCurrEffectiveCodeObjImplIfPresent } = await import(
        "/src/state/actions/sectionInfos/projectStateCore.ts"
      );
      const impl = getCurrEffectiveCodeObjImplIfPresent(
        useProjectState.getState(),
        sectionId,
        paramInfoId,
      );
      return typeof impl?.value === "string" ? impl.value : null;
    },
    { paramInfoId, sectionId },
  );
}

async function activateAndEditPasswordIsland(
  page: Page,
  sectionId: string,
  paramInfoId: string,
): Promise<void> {
  await activateRetainedRowControl(page, paramInfoId);
  const island = page.locator(
    `[data-gpu-flow-dom-island-id="param-control:${sectionId}:${paramInfoId}"]`,
  );
  await expect(island).toBeVisible();
  await expectScopedAxeClean(page, {
    include: `[data-gpu-flow-dom-island-id="param-control:${sectionId}:${paramInfoId}"]`,
  });
  await expect(island.getByRole("button", { name: /reveal/i })).toBeVisible();
  const editor = island.locator('input[type="password"]').first();
  await expect(editor).toBeVisible();
  await editor.fill("edited-secret");
  await expect(editor).toHaveValue("edited-secret");
  await dismissActiveDomIsland(page);
}

async function activateDropzoneIsland(
  page: Page,
  sectionId: string,
  paramInfoId: string,
): Promise<void> {
  await activateRetainedRowControl(page, paramInfoId);
  const island = page.locator(
    `[data-gpu-flow-dom-island-id="param-control:${sectionId}:${paramInfoId}"]`,
  );
  await expect(island).toBeVisible();
  await expectScopedAxeClean(page, {
    include: `[data-gpu-flow-dom-island-id="param-control:${sectionId}:${paramInfoId}"]`,
  });
  const fileInput = island.locator('input[type="file"]').first();
  await expect(fileInput).toBeAttached();
  await fileInput.setInputFiles(
    path.join(process.cwd(), "tests/e2e/fixtures/attachments/sample_text.txt"),
  );
  await dismissActiveDomIsland(page);
}

async function activateRetainedRowControl(
  page: Page,
  rowLabelOrId: string,
): Promise<RetainedRowTarget> {
  const target = await bringRetainedRowControlIntoViewport(page, rowLabelOrId);
  await page.mouse.click(target.clientPoint.x, target.clientPoint.y);
  return target;
}

async function bringRetainedRowControlIntoViewport(
  page: Page,
  rowLabelOrId: string,
): Promise<RetainedRowTarget> {
  let target = await resolveRetainedRowTarget(page, rowLabelOrId);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const paneBounds = await getGpuPaneBounds(page);
    if (
      isRetainedRowTargetInBounds(target, paneBounds) &&
      (await isRetainedRowTargetExposed(page, target))
    ) {
      return target;
    }
    const anchorPoint = await getEmptyPanePoint(page);
    await translateViewportBy(page, {
      x: anchorPoint.x - target.clientPoint.x,
      y: anchorPoint.y - target.clientPoint.y,
    });
    target = await resolveRetainedRowTarget(page, rowLabelOrId);
  }
  const paneBounds = await getGpuPaneBounds(page);
  if (
    !isRetainedRowTargetInBounds(target, paneBounds) ||
    !(await isRetainedRowTargetExposed(page, target))
  ) {
    throw new Error(
      `Retained row ${rowLabelOrId} control point is outside exposed GPU pane: ${Math.round(
        target.clientPoint.x,
      )},${Math.round(target.clientPoint.y)}`,
    );
  }
  return target;
}

async function getGpuPaneBounds(page: Page): Promise<{
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}> {
  const bounds = await page.locator(GPU_PANE_SELECTOR).first().boundingBox();
  if (!bounds) {
    throw new Error("Missing GPU pane bounds.");
  }
  return bounds;
}

function isRetainedRowTargetInBounds(
  target: RetainedRowTarget,
  bounds: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  },
): boolean {
  return (
    target.clientPoint.x >= bounds.x &&
    target.clientPoint.x <= bounds.x + bounds.width &&
    target.clientPoint.y >= bounds.y &&
    target.clientPoint.y <= bounds.y + bounds.height
  );
}

async function isRetainedRowTargetExposed(
  page: Page,
  target: RetainedRowTarget,
): Promise<boolean> {
  return await page.evaluate((point) => {
    const element = document.elementFromPoint(point.x, point.y);
    return Boolean(element?.closest(".setta-gpu-flow"));
  }, target.clientPoint);
}

async function translateViewportBy(
  page: Page,
  delta: { readonly x: number; readonly y: number },
): Promise<void> {
  await page.evaluate(async (delta) => {
    const [{ panGpuViewport }, { gpuFlowViewportStore }] = await Promise.all([
      import("/src/gpuFlow/viewportActions.ts"),
      import("/src/gpuFlow/viewportStore.ts"),
    ]);
    panGpuViewport(delta, { store: gpuFlowViewportStore });
  }, delta);
  await waitForAnimationFrame(page);
  await waitForAnimationFrame(page);
}

async function resolveRetainedRowTarget(
  page: Page,
  rowLabelOrId: string,
): Promise<RetainedRowTarget> {
  return await page.evaluate((rowLabelOrId) => {
    const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    const row = rows.find(
      (candidate) =>
        candidate.rowLabel === rowLabelOrId || candidate.rowId === rowLabelOrId,
    );
    if (!row) {
      throw new Error(`Missing retained row ${rowLabelOrId}.`);
    }
    if (!row.controlClientPoint) {
      throw new Error(`Missing retained control hit for ${rowLabelOrId}.`);
    }
    const visibleInCanvas =
      row.canvasSamplePoint.x >= 0 &&
      row.canvasSamplePoint.y >= 0 &&
      row.canvasSamplePoint.x < row.canvasCssSize.width &&
      row.canvasSamplePoint.y < row.canvasCssSize.height;
    if (!visibleInCanvas) {
      throw new Error(
        `Retained row ${rowLabelOrId} is outside its canvas clip: sample ${Math.round(
          row.canvasSamplePoint.x,
        )},${Math.round(row.canvasSamplePoint.y)} size ${Math.round(
          row.canvasCssSize.width,
        )}x${Math.round(row.canvasCssSize.height)}.`,
      );
    }
    return {
      clientPoint: row.controlClientPoint,
      rowId: row.rowId,
      rowRect: row.clientRect,
      surfaceId: row.surfaceId,
    };
  }, rowLabelOrId);
}

async function dismissActiveDomIsland(page: Page): Promise<void> {
  const point = await getEmptyPanePoint(page);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('[data-gpu-flow-dom-island="true"]')).toHaveCount(
    0,
  );
  await expect(
    page.locator(
      '[data-gpu-flow-dom-control="true"][data-gpu-flow-dom-control-active="true"]',
    ),
  ).toHaveCount(0);
}

async function dismissActiveDomControl(
  page: Page,
  target: RetainedRowTarget,
): Promise<void> {
  const point = await getEmptyPanePoint(page);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator(activeDomControlHostSelector(target))).toHaveCount(
    0,
  );
}

async function expectCanvasOwnsFocus(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          document.activeElement?.closest(
            '[data-gpu-flow-dom-island="true"], [data-gpu-flow-dom-control="true"]',
          ),
        ),
      ),
    )
    .toBe(false);
}

function activeDomControlHostSelector(target: RetainedRowTarget): string {
  return [
    '[data-gpu-flow-dom-control="true"]',
    '[data-gpu-flow-dom-control-active="true"]',
    `[data-gpu-flow-dom-control-surface-id="${cssAttributeEscape(
      target.surfaceId,
    )}"]`,
    `[data-gpu-flow-dom-control-row-id="${cssAttributeEscape(target.rowId)}"]`,
  ].join("");
}

function cssAttributeEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

async function performCanvasPanAndZoom(page: Page): Promise<void> {
  await performCanvasZoom(page);
  await performCanvasPan(page);
}

async function waitForGpuTextureUploadQuiet(page: Page): Promise<void> {
  let previousUploadCount: number | null = null;
  await expect
    .poll(
      async () => {
        const summary = await readGpuFlowPerformanceSummary(page);
        const currentUploadCount = summary.queue.textureUploads;
        const stable = currentUploadCount === previousUploadCount;
        previousUploadCount = currentUploadCount;
        return stable;
      },
      { intervals: [200, 200, 200, 200, 200], timeout: 2_000 },
    )
    .toBe(true);
}

async function waitForAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

async function openCommandPaletteCombobox(page: Page): Promise<Locator> {
  const shortcut =
    process.platform === "darwin" ? "Meta+Shift+P" : "Control+Shift+P";
  await page.keyboard.press(shortcut);
  return page.locator(SEARCH_INPUT_SELECTOR);
}

async function performCanvasZoom(page: Page): Promise<void> {
  const point = await getPanePoint(page, 0.55, 0.55);
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  const before = await readGpuViewportTransform(page);
  await page.mouse.move(point.x, point.y);
  await page.keyboard.down(modifier);
  await page.mouse.wheel(0, -220);
  await page.keyboard.up(modifier);
  await expect.poll(() => readGpuViewportTransform(page)).not.toEqual(before);
}

async function performCanvasPan(page: Page): Promise<void> {
  const start = await getEmptyPanePoint(page);
  const before = await readGpuViewportTransform(page);
  await page.mouse.move(start.x, start.y);
  await page.keyboard.down("Space");
  try {
    await page.mouse.down();
    await page.mouse.move(start.x + 90, start.y + 64, { steps: 8 });
    await page.mouse.up();
  } finally {
    await page.keyboard.up("Space");
  }
  await expect.poll(() => readGpuViewportTransform(page)).not.toEqual(before);
}

async function readGpuViewportTransform(
  page: Page,
): Promise<{ readonly x: number; readonly y: number; readonly zoom: number }> {
  return await page.evaluate(() => {
    const transform =
      window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport.transform;
    if (!transform) {
      throw new Error("Missing GPU flow debug transform.");
    }
    return transform;
  });
}

async function getPanePoint(
  page: Page,
  xRatio: number,
  yRatio: number,
): Promise<{ readonly x: number; readonly y: number }> {
  const box = await page.locator(GPU_PANE_SELECTOR).first().boundingBox();
  if (!box) {
    throw new Error("Missing GPU pane box.");
  }
  return {
    x: box.x + box.width * xRatio,
    y: box.y + box.height * yRatio,
  };
}

async function getEmptyPanePoint(
  page: Page,
): Promise<{ readonly x: number; readonly y: number }> {
  return await page.evaluate((paneSelector) => {
    const pane = document.querySelector(paneSelector);
    if (!pane) {
      throw new Error("Missing GPU pane.");
    }
    const paneRect = pane.getBoundingClientRect();
    const retainedRows =
      window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    const nonBackgroundSelectors = [
      ".setta-gpu-flow__node",
      "[data-gpu-flow-node='true']",
      "[data-gpu-flow-node-id]",
      "[data-gpu-flow-handle='true']",
      "[data-gpu-flow-portal-root='true']",
      "[data-gpu-flow-dom-island='true']",
      "[data-gpu-flow-dom-control='true']",
      "[data-gpu-flow-retained-content-canvas='true']",
      "[data-gpu-flow-retained-content-native='true']",
      "[data-gpu-flow-retained-content-source='true']",
      ".section-resize-handle",
      ".nodrag",
      ".nopan",
      ".nowheel",
    ];
    const candidates = [
      { x: 0.14, y: 0.22 },
      { x: 0.86, y: 0.22 },
      { x: 0.14, y: 0.78 },
      { x: 0.86, y: 0.78 },
      { x: 0.5, y: 0.86 },
      { x: 0.5, y: 0.14 },
      { x: 0.34, y: 0.34 },
      { x: 0.66, y: 0.34 },
      { x: 0.34, y: 0.66 },
      { x: 0.66, y: 0.66 },
    ];
    for (const candidate of candidates) {
      const point = {
        x: paneRect.left + paneRect.width * candidate.x,
        y: paneRect.top + paneRect.height * candidate.y,
      };
      const insideRetainedRow = retainedRows.some((row) => {
        const rowRect = row.clientRect;
        return (
          point.x >= rowRect.x &&
          point.x <= rowRect.x + rowRect.width &&
          point.y >= rowRect.y &&
          point.y <= rowRect.y + rowRect.height
        );
      });
      if (insideRetainedRow) {
        continue;
      }
      const element = document.elementFromPoint(point.x, point.y);
      const isNonBackground =
        element &&
        nonBackgroundSelectors.some((selector) => element.closest(selector));
      const isBackground =
        element &&
        pane.contains(element) &&
        !isNonBackground &&
        (element.matches(".setta-gpu-flow, .setta-gpu-flow__pane") ||
          element.closest("[data-gpu-flow-surface='true'], .setta-gpu-flow") !==
            null);
      if (isBackground) {
        return point;
      }
    }
    throw new Error("Unable to find an empty GPU pane point.");
  }, GPU_PANE_SELECTOR);
}

async function assertContextMenuAtViewportEdges(page: Page): Promise<void> {
  const points = await getPaneEdgeBackgroundPoints(page);
  for (const point of points) {
    await page.mouse.click(point.x, point.y, { button: "right" });
    const menu = page.getByTestId("context-menu-core");
    await expect(menu).toBeVisible();
    await expectFloatingBoxInsideViewport(page, menu);
    await expectScopedAxeClean(page, {
      include: '[data-testid="context-menu-core"]',
    });
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
  }
}

async function selectContextMenuItemWithKeyboard(page: Page): Promise<void> {
  const point = await getEmptyPanePoint(page);
  await page.mouse.click(point.x, point.y, { button: "right" });
  const menu = page.getByTestId("context-menu-core");
  await expect(menu).toBeVisible();
  await page.keyboard.type("code");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
}

async function selectContextMenuItemWithPointer(page: Page): Promise<void> {
  const point = await getEmptyPanePoint(page);
  await page.mouse.click(point.x, point.y, { button: "right" });
  const menu = page.getByTestId("context-menu-core");
  await expect(menu).toBeVisible();
  await menu.locator("dd, [role='option'], [role='menuitem']").first().click();
  await expect(menu).toHaveCount(0);
}

async function getPaneEdgeBackgroundPoints(
  page: Page,
): Promise<Array<{ readonly x: number; readonly y: number }>> {
  return await page.evaluate((paneSelector) => {
    const pane = document.querySelector(paneSelector);
    if (!pane) {
      throw new Error("Missing GPU pane.");
    }
    const paneRect = pane.getBoundingClientRect();
    const offsets = [8, 16, 32, 56, 88, 128, 176, 240, 320, 420, 560];
    const ratios = [0.5, 0.25, 0.75, 0.12, 0.88];
    const edges = [
      { side: "top", xRatio: true },
      { side: "right", xRatio: false },
      { side: "bottom", xRatio: true },
      { side: "left", xRatio: false },
    ] as const;
    const nonBackgroundSelectors = [
      ".setta-gpu-flow__node",
      "[data-gpu-flow-node='true']",
      "[data-gpu-flow-node-id]",
      "[data-gpu-flow-handle='true']",
      "[data-gpu-flow-portal-root='true']",
      "[data-gpu-flow-dom-island='true']",
      "[data-gpu-flow-dom-control='true']",
      "[data-gpu-flow-retained-content-canvas='true']",
      "[data-gpu-flow-retained-content-native='true']",
      "[data-gpu-flow-retained-content-source='true']",
      ".section-resize-handle",
      ".nodrag",
      ".nopan",
      ".nowheel",
    ];
    const isBackgroundPoint = (point: { x: number; y: number }) => {
      const element = document.elementFromPoint(point.x, point.y);
      if (!element || !pane.contains(element)) {
        return false;
      }
      if (
        nonBackgroundSelectors.some((selector) => element.closest(selector))
      ) {
        return false;
      }
      return (
        element.matches(".setta-gpu-flow, .setta-gpu-flow__pane") ||
        element.closest("[data-gpu-flow-surface='true'], .setta-gpu-flow") !==
          null
      );
    };
    const sampleElements: string[] = [];
    return edges.map((edge) => {
      for (const offset of offsets) {
        for (const ratio of ratios) {
          const point =
            edge.side === "top" || edge.side === "bottom"
              ? {
                  x: paneRect.left + paneRect.width * ratio,
                  y:
                    edge.side === "top"
                      ? paneRect.top + offset
                      : paneRect.bottom - offset,
                }
              : {
                  x:
                    edge.side === "left"
                      ? paneRect.left + offset
                      : paneRect.right - offset,
                  y: paneRect.top + paneRect.height * ratio,
                };
          const element = document.elementFromPoint(point.x, point.y);
          if (element) {
            sampleElements.push(
              `${edge.side}:${offset}:${ratio}:${element.tagName}.${element.className}`,
            );
          }
          if (isBackgroundPoint(point)) {
            return point;
          }
        }
      }
      throw new Error(
        `Unable to find background point near ${edge.side}: ${sampleElements
          .slice(-8)
          .join(" | ")}`,
      );
    });
  }, GPU_PANE_SELECTOR);
}

async function expectFloatingBoxInsideViewport(
  page: Page,
  locator: Locator,
): Promise<void> {
  await expect
    .poll(async () => {
      const box = await locator.boundingBox();
      const viewport = page.viewportSize();
      if (!box || !viewport) {
        return false;
      }
      return (
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= viewport.width + 1 &&
        box.y + box.height <= viewport.height + 1
      );
    })
    .toBe(true);
}

async function useRetainedSlider(page: Page, rowLabel: string): Promise<void> {
  const target = await bringRetainedRowControlIntoViewport(page, rowLabel);
  await page.mouse.move(target.clientPoint.x, target.clientPoint.y);
  await page.mouse.down();
  await page.mouse.move(target.clientPoint.x + 90, target.clientPoint.y, {
    steps: 8,
  });
  await page.mouse.up();
}

async function useRetainedDropdownPopup(
  page: Page,
  rowLabel: string,
): Promise<void> {
  await activateRetainedRowControl(page, rowLabel);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
}

async function scrollRetainedParameterSurface(
  page: Page,
  rowLabel: string,
): Promise<void> {
  const target = await bringRetainedRowControlIntoViewport(page, rowLabel);
  await page.mouse.move(
    target.rowRect.x + Math.min(24, Math.max(4, target.rowRect.width * 0.1)),
    target.rowRect.y + target.rowRect.height / 2,
  );
  const before = await readRetainedRowClientY(page, target.rowId);
  await page.mouse.wheel(0, 240);
  await expect
    .poll(() => readRetainedRowClientY(page, target.rowId))
    .not.toBe(before);
  await page.mouse.wheel(0, -240);
  await waitForAnimationFrame(page);
  await waitForAnimationFrame(page);
}

async function dragRetainedParam(
  page: Page,
  sourceLabel: string,
  targetLabel: string,
): Promise<void> {
  const source = await resolveRetainedRowTarget(page, sourceLabel);
  const target = await resolveRetainedRowTarget(page, targetLabel);
  await page.mouse.move(
    source.rowRect.x + 10,
    source.rowRect.y + source.rowRect.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    target.rowRect.x + 14,
    target.rowRect.y + target.rowRect.height + 8,
    {
      steps: 10,
    },
  );
  await page.mouse.up();
}

async function readActiveRetainedHitLabel(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const hit = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().activeRetainedHit;
    return hit ? `${hit.rowLabel ?? ""}:${hit.rowId}` : null;
  });
}

async function readRetainedRowClientY(
  page: Page,
  rowId: string,
): Promise<number | null> {
  return await page.evaluate((rowId) => {
    const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    return rows.find((row) => row.rowId === rowId)?.clientRect.y ?? null;
  }, rowId);
}
