import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  seedLocalStorage,
} from "../helpers";

const TARGET_CALLABLE = "math.sqrt";
const TEMP_DND_SUFFIX = "::TempParamDND";
const ROOMY_SECTION_SIZE = {
  width: 620,
  height: 560,
};
const COLOR_MODES = ["light", "dark"] as const;
const RENAMED_PARAM_NAMES = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
] as const;
const EDGE_PARAM_NAMES = ["a", "b", "c", "d"] as const;
const PINNED_PARAM_NAMES = ["e", "f", "g"] as const;
const UNPINNED_PARAM_NAMES = ["h", "i", "j", "k"] as const;

type ColorMode = (typeof COLOR_MODES)[number];

type CodeObjSnapshot = {
  name: string;
};

type SettingsSnapshot = Record<string, unknown> & {
  backend: Record<string, unknown> & {
    autoRefetchCallableParamsOnLspMismatch: boolean;
  };
};

type LatestProjectStateResponse = {
  projectState: {
    codeObjs: Record<string, CodeObjSnapshot>;
    projectConfig: {
      codegenTargets: Array<{
        language: string;
        genCodePrefix?: string | null;
      }>;
      sectionVariantMap: Record<string, string>;
    };
    shownParamIds: Record<
      string,
      {
        pinned: {
          requiredParamIdsToPaths: Record<string, string[]>;
          topLevelParamIds: string[];
        };
        unpinned: {
          requiredParamIdsToPaths: Record<string, string[]>;
          topLevelParamIds: string[];
        };
      }
    >;
  };
};

type ParamIdsByName = Record<string, string>;

type CallableScenarioContext = {
  projectContext: Awaited<ReturnType<typeof openIsolatedProject>>;
  projectConfigId: string;
  projectConfigName: string;
  sectionId: string;
  sectionName: string;
  sectionSlug: string;
  sectionNode: Locator;
  idsByName: ParamIdsByName;
  restoreSettings: () => Promise<void>;
};

function getProjectConfigNameFromUrl(url: string): string {
  const pathname = new URL(url).pathname;
  const projectConfigName = pathname.split("/").filter(Boolean)[0];
  if (!projectConfigName) {
    throw new Error("Unable to resolve project config name from URL.");
  }
  return projectConfigName;
}

function buildStandaloneUrl(currentUrl: string, pathname: string): string {
  const nextUrl = new URL(currentUrl);
  nextUrl.pathname = pathname;
  nextUrl.hash = "";
  return nextUrl.toString();
}

async function resolveSectionSlug(
  page: Page,
  sectionName: string,
): Promise<string> {
  return page.evaluate(async (name) => {
    const { sanitizeNameForSlug } = await import(
      "/src/utils/nameValidation.ts"
    );
    return sanitizeNameForSlug(name);
  }, sectionName);
}

async function seedColorMode(page: Page, colorMode: ColorMode): Promise<void> {
  await seedLocalStorage(page, {
    colorMode,
    darkMode: colorMode === "dark",
  });
}

async function assertColorModeApplied(
  page: Page,
  colorMode: ColorMode,
): Promise<void> {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        return document.documentElement.classList.contains("dark");
      });
    })
    .toBe(colorMode === "dark");
}

async function loadLatestProjectState(
  page: Page,
  projectConfigId: string,
): Promise<LatestProjectStateResponse["projectState"]> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  if (!response?.projectState) {
    throw new Error("Missing latest project state response.");
  }
  return response.projectState;
}

async function loadSettings(page: Page): Promise<SettingsSnapshot> {
  const settings = await postBackend<SettingsSnapshot>(
    page,
    "/loadSettings",
    null,
  );
  if (!settings) {
    throw new Error("Missing settings payload.");
  }
  return settings;
}

async function saveSettings(
  page: Page,
  settings: SettingsSnapshot,
): Promise<void> {
  await postBackend(page, "/saveSettings", { settings });
}

async function disableCallableParamAutoRefetch(
  page: Page,
): Promise<() => Promise<void>> {
  const originalSettings = await loadSettings(page);
  if (!originalSettings.backend.autoRefetchCallableParamsOnLspMismatch) {
    return async () => {};
  }

  const nextSettings = JSON.parse(
    JSON.stringify(originalSettings),
  ) as SettingsSnapshot;
  nextSettings.backend.autoRefetchCallableParamsOnLspMismatch = false;
  await saveSettings(page, nextSettings);

  return async () => {
    await saveSettings(page, originalSettings);
  };
}

function getPythonPrefix(
  projectState: LatestProjectStateResponse["projectState"],
): string {
  const pythonTarget = projectState.projectConfig.codegenTargets.find(
    (target) => target.language === "python",
  );
  return pythonTarget?.genCodePrefix ?? "";
}

async function ensureMathImport(
  page: Page,
  projectConfigId: string,
): Promise<void> {
  const projectState = await loadLatestProjectState(page, projectConfigId);
  const prefix = getPythonPrefix(projectState);
  if (/^\s*import math\s*$/m.test(prefix)) {
    return;
  }

  const separator = prefix.length > 0 && !prefix.endsWith("\n") ? "\n" : "";
  await postBackend(page, "/setGenCodePrefix", {
    projectConfigId,
    genCodePrefix: `${prefix}${separator}import math\n`,
  });

  await expect
    .poll(async () => {
      const nextState = await loadLatestProjectState(page, projectConfigId);
      return /^\s*import math\s*$/m.test(getPythonPrefix(nextState));
    })
    .toBe(true);
}

async function setCallable(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<void> {
  await postBackend(page, "/setCallable", {
    projectConfigId,
    sectionId,
    callableName: TARGET_CALLABLE,
    refetchParams: true,
  });
}

async function setSectionName(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  name: string,
): Promise<void> {
  await postBackend(page, "/setSectionName", {
    projectConfigId,
    sectionId,
    name,
  });
}

async function setCodeObjName(
  page: Page,
  projectConfigId: string,
  codeObjId: string,
  name: string,
): Promise<void> {
  await postBackend(page, "/setCodeObjName", {
    projectConfigId,
    codeObjId,
    name,
  });
}

function getNewCodeObjId(beforeIds: Set<string>, afterIds: string[]): string {
  const newIds = afterIds.filter((id) => !beforeIds.has(id));
  if (newIds.length !== 1) {
    throw new Error(
      `Expected exactly one new code obj id, found ${newIds.length}: ${newIds.join(", ")}`,
    );
  }
  return newIds[0];
}

async function addKwargAndReturnId(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  knownIds: Set<string>,
): Promise<string> {
  await postBackend(page, "/addKwarg", { projectConfigId, sectionId });
  const nextState = await loadLatestProjectState(page, projectConfigId);
  const nextIds = Object.keys(nextState.codeObjs);
  const newId = getNewCodeObjId(knownIds, nextIds);
  knownIds.add(newId);
  return newId;
}

function collectShownParamIds(
  shown: LatestProjectStateResponse["projectState"]["shownParamIds"][string],
): string[] {
  return Array.from(
    new Set([
      ...shown.pinned.topLevelParamIds,
      ...shown.unpinned.topLevelParamIds,
      ...Object.keys(shown.pinned.requiredParamIdsToPaths),
      ...Object.keys(shown.unpinned.requiredParamIdsToPaths),
    ]),
  );
}

function getShownParamIdsByName(
  projectState: LatestProjectStateResponse["projectState"],
  sectionId: string,
): ParamIdsByName {
  const variantId = projectState.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return {};
  }
  const shown = projectState.shownParamIds[variantId];
  if (!shown) {
    return {};
  }
  const result: ParamIdsByName = {};
  for (const paramId of collectShownParamIds(shown)) {
    if (paramId.endsWith(TEMP_DND_SUFFIX)) {
      continue;
    }
    const snapshot = projectState.codeObjs[paramId];
    if (!snapshot?.name) {
      continue;
    }
    result[snapshot.name] = paramId;
  }
  return result;
}

async function waitForStateParamIdsByName(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  requiredNames: readonly string[],
): Promise<ParamIdsByName> {
  let latestIds: ParamIdsByName = {};
  await expect
    .poll(async () => {
      const projectState = await loadLatestProjectState(page, projectConfigId);
      latestIds = getShownParamIdsByName(projectState, sectionId);
      return requiredNames.every((name) => Boolean(latestIds[name]));
    })
    .toBe(true);
  return latestIds;
}

async function captureSurfaceScreenshot(
  root: Locator,
  testInfo: TestInfo,
  name: string,
): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await root.screenshot({ path });
  await testInfo.attach(name, {
    path,
    contentType: "image/png",
  });
}

async function dragHandle(
  page: Page,
  handle: Locator,
  deltaX: number,
  deltaY: number,
): Promise<void> {
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error("Missing resize handle bounds.");
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 12 });
  await page.mouse.up();
}

async function dragParamBeforeTarget(
  page: Page,
  source: Locator,
  target: Locator,
): Promise<void> {
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("Missing param row bounds for drag.");
  }

  const startX = sourceBox.x + Math.min(20, sourceBox.width / 3);
  const startY = sourceBox.y + sourceBox.height / 2;
  const endX = targetBox.x + Math.min(20, targetBox.width / 3);
  const endY = targetBox.y + Math.max(6, targetBox.height / 4);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await page.mouse.move(endX, endY, { steps: 18 });
  await page.waitForTimeout(100);
  await page.mouse.up();
}

async function getSectionWidth(root: Locator): Promise<number> {
  const box = await root.boundingBox();
  if (!box) {
    throw new Error("Missing section bounds.");
  }
  return box.width;
}

async function getSectionHeight(root: Locator): Promise<number> {
  const box = await root.boundingBox();
  if (!box) {
    throw new Error("Missing section bounds.");
  }
  return box.height;
}

function getUnpinnedContainer(root: Locator): Locator {
  return root.locator("div.section-args-nested.overflow-y-scroll").first();
}

async function getUnpinnedOverflowAmount(root: Locator): Promise<number> {
  return await getUnpinnedContainer(root).evaluate((node) => {
    return Math.max(0, node.scrollHeight - node.clientHeight);
  });
}

async function canScrollUnpinnedContainer(root: Locator): Promise<boolean> {
  return await getUnpinnedContainer(root).evaluate((node) => {
    if (node.scrollHeight <= node.clientHeight) {
      return false;
    }
    node.scrollTop = 24;
    return node.scrollTop > 0;
  });
}

async function getParamColumnWidth(root: Locator): Promise<number> {
  return await root
    .locator(".section-row-pin-main")
    .first()
    .evaluate((node) => {
      const rawValue = window
        .getComputedStyle(node)
        .getPropertyValue("--param-column-width")
        .trim();
      const parsed = Number.parseFloat(rawValue);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid param column width: "${rawValue}"`);
      }
      return parsed;
    });
}

async function getVisibleUnpinnedParamIds(
  root: Locator,
  sectionId: string,
): Promise<string[]> {
  const idPrefix = `ParamContainer-${sectionId}-`;
  return await getUnpinnedContainer(root).evaluateAll(
    (nodes, prefix) =>
      nodes
        .flatMap((container) =>
          Array.from(container.querySelectorAll(":scope > [id]")).map(
            (node) => node.id,
          ),
        )
        .filter((id) => id.startsWith(prefix))
        .map((id) => id.slice(prefix.length)),
    idPrefix,
  );
}

function invertParamIdsByName(
  idsByName: ParamIdsByName,
): Record<string, string> {
  const nameById: Record<string, string> = {};
  for (const [name, id] of Object.entries(idsByName)) {
    nameById[id] = name;
  }
  return nameById;
}

async function getVisibleUnpinnedParamNames(
  root: Locator,
  sectionId: string,
  idsByName: ParamIdsByName,
): Promise<string[]> {
  const nameById = invertParamIdsByName(idsByName);
  const ids = await getVisibleUnpinnedParamIds(root, sectionId);
  return ids.map((id) => {
    const name = nameById[id];
    if (!name) {
      throw new Error(`Missing visible param name for id "${id}".`);
    }
    return name;
  });
}

async function waitForVisibleUnpinnedOrder(
  root: Locator,
  sectionId: string,
  idsByName: ParamIdsByName,
  expectedNames: readonly string[],
): Promise<void> {
  await expect
    .poll(async () => {
      const names = await getVisibleUnpinnedParamNames(
        root,
        sectionId,
        idsByName,
      );
      return names.join(" > ");
    })
    .toBe(expectedNames.join(" > "));
}

async function setParamSelectionMode(
  page: Page,
  enabled: boolean,
): Promise<void> {
  await page.evaluate(async (nextEnabled) => {
    const { activateParamSelect, deactivateParamSelect } = await import(
      "/src/state/actions/paramSelect"
    );
    if (nextEnabled) {
      activateParamSelect();
      return;
    }
    deactivateParamSelect();
  }, enabled);
}

async function clearSelectedParams(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { unselectAllParams } = await import(
      "/src/state/actions/sectionInfos"
    );
    unselectAllParams();
  });
}

async function setActiveSection(page: Page, sectionId: string): Promise<void> {
  await page.evaluate(async (nextSectionId) => {
    const { setActiveSectionIds } = await import(
      "/src/state/actions/activeSections.ts"
    );
    setActiveSectionIds([nextSectionId], { syncMode: "ui-only" });
  }, sectionId);
}

async function selectParamRow(row: Locator): Promise<void> {
  await expect(row).toBeVisible();
  await row.click({ position: { x: 18, y: 12 } });
  await expect(row).toHaveClass(/!bg-blue-700/);
}

async function pressParamIndentShortcut(
  page: Page,
  shift: boolean,
): Promise<void> {
  await page.evaluate(() => {
    const activeElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    activeElement?.blur();
  });
  if (shift) {
    await page.keyboard.press("Shift+Tab");
    return;
  }
  await page.keyboard.press("Tab");
}

function getParamRow(
  root: Locator,
  sectionId: string,
  paramId: string,
): Locator {
  return root.locator(`#ParamContainer-${sectionId}-${paramId}`);
}

async function attachJson(
  testInfo: TestInfo,
  name: string,
  payload: Record<string, number | boolean | string>,
): Promise<void> {
  await testInfo.attach(name, {
    body: JSON.stringify(payload, null, 2),
    contentType: "application/json",
  });
}

async function setupMathSqrtScenario(
  page: Page,
  colorMode: ColorMode,
): Promise<CallableScenarioContext> {
  await seedColorMode(page, colorMode);
  await ensureAppReady(page);
  await assertColorModeApplied(page, colorMode);

  const restoreSettings = await disableCallableParamAutoRefetch(page);
  let projectContext: Awaited<ReturnType<typeof openIsolatedProject>> | null =
    null;
  try {
    projectContext = await openIsolatedProject(page);
    const projectConfigId = projectContext.projectConfigId;
    const projectConfigName = getProjectConfigNameFromUrl(page.url());
    const sectionId = await createCallableSection(page, projectConfigId);
    const sectionNode = page.getByTestId(`rf__node-${sectionId}`);
    const sectionName = `callable-math-sqrt-${colorMode}-${Date.now()}`;

    await setSectionName(page, projectConfigId, sectionId, sectionName);
    await ensureMathImport(page, projectConfigId);
    await setCallable(page, projectConfigId, sectionId);

    await expect(
      sectionNode.locator(`[id^="ParamContainer-${sectionId}-"]`).first(),
    ).toBeVisible({ timeout: 20000 });

    const initialIds = await waitForStateParamIdsByName(
      page,
      projectConfigId,
      sectionId,
      ["x"],
    );
    await setCodeObjName(page, projectConfigId, initialIds.x, "a");

    const initialState = await loadLatestProjectState(page, projectConfigId);
    const knownIds = new Set(Object.keys(initialState.codeObjs));

    for (const nextName of ["b", "c", "d", "e", "f", "g", "h", "i", "j", "k"]) {
      const newId = await addKwargAndReturnId(
        page,
        projectConfigId,
        sectionId,
        knownIds,
      );
      await setCodeObjName(page, projectConfigId, newId, nextName);
    }

    const idsByName = await waitForStateParamIdsByName(
      page,
      projectConfigId,
      sectionId,
      RENAMED_PARAM_NAMES,
    );

    await postBackend(page, "/setSectionEdgeInputs", {
      projectConfigId,
      sectionId,
      edgeInputParams: EDGE_PARAM_NAMES.map((name) => idsByName[name]),
    });
    await postBackend(page, "/setSectionPinnedParams", {
      projectConfigId,
      sectionId,
      pinnedParams: PINNED_PARAM_NAMES.map((name) => idsByName[name]),
    });
    await postBackend(page, "/setSectionSizes", {
      projectConfigId,
      sectionSizes: {
        [sectionId]: ROOMY_SECTION_SIZE,
      },
    });

    const sectionSlug = await resolveSectionSlug(page, sectionName);

    return {
      projectContext,
      projectConfigId,
      projectConfigName,
      sectionId,
      sectionName,
      sectionSlug,
      sectionNode,
      idsByName,
      restoreSettings,
    };
  } catch (error) {
    await restoreSettings();
    await cleanupIsolatedProject(page, projectContext);
    throw error;
  }
}

async function cleanupScenario(
  page: Page,
  context: CallableScenarioContext | null,
): Promise<void> {
  if (!context) {
    return;
  }
  try {
    await context.restoreSettings();
  } finally {
    await cleanupIsolatedProject(page, context.projectContext);
  }
}

async function assertBaselineSurfaceScenario(
  context: CallableScenarioContext,
  root: Locator,
  testInfo: TestInfo,
  screenshotName: string,
): Promise<void> {
  const { sectionId, idsByName } = context;

  for (const name of EDGE_PARAM_NAMES) {
    await expect(
      root.locator(`[data-edge-param-id="${idsByName[name]}"]`),
    ).toBeVisible();
  }
  await expect(root.getByText("Pinned Params")).toBeVisible();
  for (const name of PINNED_PARAM_NAMES) {
    await expect(getParamRow(root, sectionId, idsByName[name])).toBeVisible();
  }
  for (const name of UNPINNED_PARAM_NAMES) {
    await expect(getParamRow(root, sectionId, idsByName[name])).toBeVisible();
  }

  await root.scrollIntoViewIfNeeded();
  await root.hover();
  await captureSurfaceScreenshot(root, testInfo, screenshotName);

  await expect
    .poll(async () => await getUnpinnedOverflowAmount(root))
    .toBeLessThan(4);
}

async function runWorkspaceResizeFlow(
  page: Page,
  context: CallableScenarioContext,
  testInfo: TestInfo,
  prefix: string,
): Promise<void> {
  const { sectionNode } = context;
  await assertBaselineSurfaceScenario(
    context,
    sectionNode,
    testInfo,
    `${prefix}-01-roomy`,
  );

  const rightHandle = sectionNode.locator(".section-resize-handle-right");
  const bottomHandle = sectionNode.locator(".section-resize-handle-bottom");
  const bottomRightHandle = sectionNode.locator(
    ".section-resize-handle-bottom-right",
  );

  const roomyHeight = await getSectionHeight(sectionNode);
  const roomyWidth = await getSectionWidth(sectionNode);
  const baselineOverflow = await getUnpinnedOverflowAmount(sectionNode);

  await sectionNode.hover();
  await dragHandle(page, bottomHandle, 0, -220);
  await expect
    .poll(async () => await getSectionHeight(sectionNode))
    .toBeLessThan(roomyHeight - 140);
  const overflowAfterBottom = await getUnpinnedOverflowAmount(sectionNode);
  const canScrollAfterBottom = await canScrollUnpinnedContainer(sectionNode);
  await sectionNode.hover();
  await captureSurfaceScreenshot(
    sectionNode,
    testInfo,
    `${prefix}-02-bottom-overflow`,
  );

  await sectionNode.hover();
  await dragHandle(page, bottomRightHandle, 180, 260);
  await expect
    .poll(async () => await getSectionHeight(sectionNode))
    .toBeGreaterThan(roomyHeight - 40);
  const overflowAfterRecover = await getUnpinnedOverflowAmount(sectionNode);
  await sectionNode.hover();
  await captureSurfaceScreenshot(
    sectionNode,
    testInfo,
    `${prefix}-03-bottom-right-recovered`,
  );

  const recoveredWidth = await getSectionWidth(sectionNode);
  await sectionNode.hover();
  await dragHandle(page, rightHandle, -90, 0);
  await expect
    .poll(async () => await getSectionWidth(sectionNode))
    .toBeLessThan(recoveredWidth - 60);
  await sectionNode.hover();
  await captureSurfaceScreenshot(
    sectionNode,
    testInfo,
    `${prefix}-04-right-narrow`,
  );

  await expect(sectionNode).toBeVisible();
  await expect(rightHandle).toBeVisible();
  await expect(bottomHandle).toBeVisible();
  await expect(bottomRightHandle).toBeVisible();
  await attachJson(testInfo, `${prefix}-metrics`, {
    baselineOverflow,
    overflowAfterBottom,
    canScrollAfterBottom,
    overflowAfterRecover,
    roomyHeight,
    roomyWidth,
    finalWidth: await getSectionWidth(sectionNode),
  });
}

async function runColumnResizeFlow(
  page: Page,
  root: Locator,
  testInfo: TestInfo,
  prefix: string,
): Promise<void> {
  const columnHandle = root
    .locator(`[data-param-resize-handle="true"]`)
    .first();
  const roomyColumnWidth = await getParamColumnWidth(root);

  await root.hover();
  await dragHandle(page, columnHandle, -70, 0);
  await expect
    .poll(async () => await getParamColumnWidth(root))
    .toBeLessThan(roomyColumnWidth - 40);
  const narrowedColumnWidth = await getParamColumnWidth(root);
  await root.hover();
  await captureSurfaceScreenshot(root, testInfo, `${prefix}-02-column-narrow`);

  await root.hover();
  await dragHandle(page, columnHandle, 130, 0);
  await expect
    .poll(async () => await getParamColumnWidth(root))
    .toBeGreaterThan(narrowedColumnWidth + 60);
  const widenedColumnWidth = await getParamColumnWidth(root);
  await root.hover();
  await captureSurfaceScreenshot(root, testInfo, `${prefix}-03-column-wide`);

  await attachJson(testInfo, `${prefix}-column-metrics`, {
    roomyColumnWidth,
    narrowedColumnWidth,
    widenedColumnWidth,
  });
}

async function runReorderAndIndentFlow(
  page: Page,
  root: Locator,
  context: CallableScenarioContext,
  testInfo: TestInfo,
  prefix: string,
): Promise<void> {
  const { sectionId, idsByName } = context;
  const rowH = getParamRow(root, sectionId, idsByName.h);
  const rowI = getParamRow(root, sectionId, idsByName.i);
  const rowK = getParamRow(root, sectionId, idsByName.k);

  await setActiveSection(page, sectionId);
  await setParamSelectionMode(page, true);
  try {
    await clearSelectedParams(page);
    await selectParamRow(rowK);
    await dragParamBeforeTarget(page, rowK, rowH);
    await waitForVisibleUnpinnedOrder(root, sectionId, idsByName, [
      "k",
      "h",
      "i",
      "j",
    ]);
    const reorderedVisibleOrder = (
      await getVisibleUnpinnedParamNames(root, sectionId, idsByName)
    ).join(" > ");
    await root.hover();
    await captureSurfaceScreenshot(root, testInfo, `${prefix}-02-reordered`);

    await clearSelectedParams(page);
    await selectParamRow(rowI);
    await pressParamIndentShortcut(page, false);
    await expect(
      root.locator(
        `#ParamContainer-${sectionId}-${idsByName.h} + #ParamContainer-${sectionId}-${idsByName.i}`,
      ),
    ).toHaveCount(1);
    await expect(rowI).toHaveClass(/ml-\[1\.44rem\]/);
    await waitForVisibleUnpinnedOrder(root, sectionId, idsByName, [
      "k",
      "h",
      "i",
      "j",
    ]);
    const indentedVisibleOrder = (
      await getVisibleUnpinnedParamNames(root, sectionId, idsByName)
    ).join(" > ");
    await root.hover();
    await captureSurfaceScreenshot(root, testInfo, `${prefix}-03-indented`);

    await pressParamIndentShortcut(page, true);
    await expect(rowI).not.toHaveClass(/ml-\[1\.44rem\]/);
    await waitForVisibleUnpinnedOrder(root, sectionId, idsByName, [
      "k",
      "h",
      "i",
      "j",
    ]);
    const restoredVisibleOrder = (
      await getVisibleUnpinnedParamNames(root, sectionId, idsByName)
    ).join(" > ");
    await root.hover();
    await captureSurfaceScreenshot(root, testInfo, `${prefix}-04-unindented`);

    await attachJson(testInfo, `${prefix}-structure-metrics`, {
      reorderedVisibleOrder,
      indentedVisibleOrder,
      restoredVisibleOrder,
      nestedParentAfterIndent: "h",
    });
  } finally {
    await clearSelectedParams(page);
    await setParamSelectionMode(page, false);
  }
}

async function openStandaloneSectionSurface(
  page: Page,
  context: CallableScenarioContext,
  colorMode: ColorMode,
): Promise<{ standalonePage: Page; surface: Locator }> {
  const standalonePage = await page.context().newPage();
  await standalonePage.setViewportSize({ width: 1600, height: 1400 });
  await seedColorMode(standalonePage, colorMode);
  const standaloneUrl = buildStandaloneUrl(
    page.url(),
    `/${encodeURIComponent(context.projectConfigName)}/section/${encodeURIComponent(context.sectionSlug)}`,
  );
  await standalonePage.goto(standaloneUrl, { waitUntil: "domcontentloaded" });
  await assertColorModeApplied(standalonePage, colorMode);

  const standaloneSurface = standalonePage.getByTestId(
    "standalone-section-surface",
  );
  await expect(standaloneSurface).toBeVisible();
  await expect(standalonePage.locator("#OverviewPane")).toHaveCount(0);
  await expect(standalonePage.locator("#UiEditorPane")).toHaveCount(0);

  const surface = standaloneSurface.locator(
    `[data-testid="section-window-surface"][data-section-id="${context.sectionId}"]`,
  );
  await expect(surface).toBeVisible();

  return {
    standalonePage,
    surface,
  };
}

test.describe.serial("callable minimum regression", () => {
  for (const colorMode of COLOR_MODES) {
    test(`${colorMode} workspace callable resize flow records screenshots for section and column resize`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 1600, height: 1400 });
      let context: CallableScenarioContext | null = null;

      try {
        context = await setupMathSqrtScenario(page, colorMode);
        await runWorkspaceResizeFlow(
          page,
          context,
          testInfo,
          `${colorMode}-workspace-resize`,
        );
        await runColumnResizeFlow(
          page,
          context.sectionNode,
          testInfo,
          `${colorMode}-workspace-resize`,
        );
      } finally {
        await cleanupScenario(page, context);
      }
    });

    test(`${colorMode} workspace and standalone callable routes preserve reorder and tab indent behavior`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width: 1600, height: 1400 });
      let context: CallableScenarioContext | null = null;
      let standalonePage: Page | null = null;

      try {
        context = await setupMathSqrtScenario(page, colorMode);
        await assertBaselineSurfaceScenario(
          context,
          context.sectionNode,
          testInfo,
          `${colorMode}-workspace-structure-01-roomy`,
        );
        await runReorderAndIndentFlow(
          page,
          context.sectionNode,
          context,
          testInfo,
          `${colorMode}-workspace-structure`,
        );

        const standaloneSurfaceContext = await openStandaloneSectionSurface(
          page,
          context,
          colorMode,
        );
        standalonePage = standaloneSurfaceContext.standalonePage;

        await assertBaselineSurfaceScenario(
          context,
          standaloneSurfaceContext.surface,
          testInfo,
          `${colorMode}-standalone-01-roomy`,
        );
        await expect(
          standaloneSurfaceContext.surface.locator(
            ".section-resize-handle-right",
          ),
        ).toHaveCount(0);
        await expect(
          standaloneSurfaceContext.surface.locator(
            ".section-resize-handle-bottom",
          ),
        ).toHaveCount(0);
        await expect(
          standaloneSurfaceContext.surface.locator(
            ".section-resize-handle-bottom-right",
          ),
        ).toHaveCount(0);
        await runColumnResizeFlow(
          standalonePage,
          standaloneSurfaceContext.surface,
          testInfo,
          `${colorMode}-standalone`,
        );
        await runReorderAndIndentFlow(
          standalonePage,
          standaloneSurfaceContext.surface,
          context,
          testInfo,
          `${colorMode}-standalone`,
        );
      } finally {
        await standalonePage?.close();
        await cleanupScenario(page, context);
      }
    });
  }
});
