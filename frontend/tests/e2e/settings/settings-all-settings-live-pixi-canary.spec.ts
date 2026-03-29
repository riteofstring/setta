import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  LIVE_DICT_AREA_PIXI_MAX_BACKING_PIXELS,
  LIVE_DICT_AREA_PIXI_MIN_USABLE_CANVAS_HEIGHT,
  LIVE_DICT_AREA_PIXI_OVERVIEW_QUERY_PARAM,
} from "../../../src/components/Params/liveDictAreaPixiSceneView";
import {
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MEASURE_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTATION_TAIL_MEASURE_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MARK_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MEASURE_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MEASURE_NAME,
  LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME,
} from "../../../src/components/Params/liveDictAreaPixiValueRowPerf";
import { LIVE_DICT_AREA_RENDERER_QUERY_PARAM } from "../../../src/components/Section/Layouts/liveDictAreaRendererMode";
import {
  clearCurrentProjectViewportForRefit,
  ensureAppReady,
  getCurrentProjectConfigId,
  loadProjectConfig,
  postBackend,
  readActiveBackendOrigin,
  readProjectWorkspaceChromeLayout,
  readVisibleProjectChatChrome,
  resetProjectWorkspaceChromeToDefaultLayout,
} from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const WORKTREE_BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const MAIN_REFERENCE_BASE_URL = process.env.SETTA_MAIN_REFERENCE_URL ?? null;
const MAIN_REFERENCE_BOOTSTRAP_URL =
  process.env.SETTA_MAIN_REFERENCE_BOOTSTRAP_URL ?? null;
const MAIN_REFERENCE_BACKEND_ORIGIN = MAIN_REFERENCE_BOOTSTRAP_URL
  ? new URL(MAIN_REFERENCE_BOOTSTRAP_URL).origin
  : null;
const SETTINGS_URL = new URL("/settings", BASE_URL);
const READY_SELECTOR = ".react-flow__pane";
const LIVE_DICT_AREA_RENDERER_STORAGE_KEY = "setta.liveDictAreaRendererMode";
const LIVE_DICT_AREA_INTERACTION_MODE_QUERY_PARAM =
  "liveDictAreaInteractionMode";
const LIVE_PIXI_MODE = "pixi-node-body";
const SETTINGS_LAYOUT_GRID_COLUMNS = 3;
const SETTINGS_LAYOUT_GRID_SPACING = 600;
const SETTA_AUTH_COOKIE_NAME_PREFIX = "setta_auth";
const NOTIFICATIONS_STORE_MODULE_URL = "/src/state/definitions.ts";
// Use the exact browser module URL that the app resolves for the singleton
// Zustand store. Importing the directory URL creates a second detached store.
const REACT_FLOW_STORE_MODULE_URL = "/src/forks/xyflow/core/store/index.ts";

type DragOverlayRow = {
  height: number;
  id: string;
  top: number;
};

type ValueRowPerfSnapshot = {
  overlayDuration: number;
  presentationTailDuration: number;
  presentedDuration: number;
  presentedEditorKind: string | null;
  presentedRowId: string | null;
  readyDuration: number;
  readyEditorKind: string | null;
  readyRowId: string | null;
  startEditorKind: string | null;
  startRowId: string | null;
};

type ViewportTransform = {
  x: number;
  y: number;
  zoom: number;
};

type AllSettingsRuntime = {
  baseUrl: string;
  bootstrapUrl?: string | null;
  requireAppReady: boolean;
};

type VisibleBlockBounds = {
  blockId: string;
  height: number;
  sectionId: string;
  width: number;
  x: number;
  y: number;
};

type VisibleSectionNodeBounds = {
  height: number;
  sectionId: string;
  sectionName: string;
  width: number;
  x: number;
  y: number;
};

type VisibleScenePaletteSample = {
  left: number;
  panelBackground: string;
  rowBackground: string;
  sectionId: string;
  top: number;
};

type LiveDictAreaPageRuntimeSnapshot = {
  count: number;
  contextLost: boolean;
  domContextLostCount: number;
  domContextLostSectionNames: string[];
  domContextLostSections: string[];
  hostPresent: boolean;
  managedSceneName: string;
  managedSceneNames: string[];
  pixiCount: number;
  sectionNames: string[];
  sections: string[];
};

function getBlockKey(block: Pick<VisibleBlockBounds, "blockId" | "sectionId">) {
  return `${block.sectionId}:${block.blockId}`;
}

function parseRgbColor(
  rawColor: string,
): { b: number; g: number; r: number } | null {
  const normalizedColor = rawColor.trim().toLowerCase();
  if (normalizedColor.startsWith("#")) {
    const hexValue = normalizedColor.slice(1);
    if (hexValue.length !== 6) {
      return null;
    }

    const r = Number.parseInt(hexValue.slice(0, 2), 16);
    const g = Number.parseInt(hexValue.slice(2, 4), 16);
    const b = Number.parseInt(hexValue.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return null;
    }

    return { b, g, r };
  }

  const channelMatches = normalizedColor.match(/\d+(?:\.\d+)?/g);
  if (!channelMatches || channelMatches.length < 3) {
    return null;
  }

  const [rawR, rawG, rawB] = channelMatches;
  const r = Number.parseFloat(rawR);
  const g = Number.parseFloat(rawG);
  const b = Number.parseFloat(rawB);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return null;
  }

  return {
    b: Math.max(0, Math.min(255, Math.round(b))),
    g: Math.max(0, Math.min(255, Math.round(g))),
    r: Math.max(0, Math.min(255, Math.round(r))),
  };
}

function getColorLuminance(rawColor: string): number | null {
  const rgbColor = parseRgbColor(rawColor);
  if (!rgbColor) {
    return null;
  }

  const linearize = (channel: number) => {
    const normalizedChannel = channel / 255;
    if (normalizedChannel <= 0.04045) {
      return normalizedChannel / 12.92;
    }

    return Math.pow((normalizedChannel + 0.055) / 1.055, 2.4);
  };

  return (
    0.2126 * linearize(rgbColor.r) +
    0.7152 * linearize(rgbColor.g) +
    0.0722 * linearize(rgbColor.b)
  );
}

async function setLiveDictAreaRendererMode(
  page: Page,
  mode: string | null,
): Promise<void> {
  await page.evaluate(
    ({ mode: nextMode, storageKey }) => {
      if (nextMode === null) {
        window.sessionStorage.removeItem(storageKey);
        return;
      }
      window.sessionStorage.setItem(storageKey, nextMode);
    },
    {
      mode,
      storageKey: LIVE_DICT_AREA_RENDERER_STORAGE_KEY,
    },
  );
}

function buildSettingsUrl(runtime: AllSettingsRuntime): URL {
  const url = new URL("/settings", runtime.baseUrl);
  if (runtime.bootstrapUrl) {
    url.searchParams.set(
      "__setta_backend_origin",
      new URL(runtime.bootstrapUrl).origin,
    );
  }
  return url;
}

async function bootstrapRuntimeIfNeeded(
  page: Page,
  runtime: AllSettingsRuntime,
): Promise<void> {
  if (!runtime.bootstrapUrl) {
    return;
  }

  const expectedOrigin = new URL(runtime.baseUrl).origin;
  await page.goto(runtime.bootstrapUrl, { waitUntil: "domcontentloaded" });
  await page.waitForURL((url) => url.origin === expectedOrigin, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(".setta-titlebar-offset", { state: "attached" });
}

async function hasSettaAuthCookieForRuntime(
  page: Page,
  runtime: AllSettingsRuntime,
): Promise<boolean> {
  const cookies = await page.context().cookies([runtime.baseUrl]);
  return cookies.some((cookie) => {
    return (
      cookie.name.startsWith(SETTA_AUTH_COOKIE_NAME_PREFIX) &&
      cookie.value.length > 0
    );
  });
}

async function openAllSettingsPage(
  page: Page,
  runtime: AllSettingsRuntime,
  options?: {
    interactionMode?: "param-select";
    overviewEnabled?: boolean;
    rendererMode?: string | null;
  },
) {
  if (runtime.requireAppReady) {
    await ensureAppReady(page);
  } else if (!(await hasSettaAuthCookieForRuntime(page, runtime))) {
    await bootstrapRuntimeIfNeeded(page, runtime);
  }
  const rendererMode = options?.rendererMode ?? null;
  if (rendererMode !== null || page.url().startsWith(runtime.baseUrl)) {
    await setLiveDictAreaRendererMode(page, rendererMode);
  }

  const url = buildSettingsUrl(runtime);
  if (options?.interactionMode) {
    url.searchParams.set(
      LIVE_DICT_AREA_INTERACTION_MODE_QUERY_PARAM,
      options.interactionMode,
    );
  }
  if (options?.overviewEnabled) {
    url.searchParams.set(LIVE_DICT_AREA_PIXI_OVERVIEW_QUERY_PARAM, "enabled");
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

async function openAllSettingsLivePixiCanary(
  page: Page,
  options?: {
    interactionMode?: "param-select";
    overviewEnabled?: boolean;
  },
) {
  await openAllSettingsPage(
    page,
    {
      baseUrl: BASE_URL,
      requireAppReady: true,
    },
    {
      interactionMode: options?.interactionMode,
      overviewEnabled: options?.overviewEnabled,
      rendererMode: LIVE_PIXI_MODE,
    },
  );
}

async function openAllSettingsLivePixiQueryParamCanary(page: Page) {
  await ensureAppReady(page);
  await setLiveDictAreaRendererMode(page, null);

  const url = buildSettingsUrl({
    baseUrl: BASE_URL,
    requireAppReady: true,
  });
  url.searchParams.set(LIVE_DICT_AREA_RENDERER_QUERY_PARAM, LIVE_PIXI_MODE);

  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allSettingsTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allSettingsTab).toBeVisible();
  await allSettingsTab.click();
}

async function openAllSettingsBaseline(page: Page): Promise<void> {
  await openAllSettingsPage(
    page,
    {
      baseUrl: BASE_URL,
      requireAppReady: true,
    },
    { rendererMode: null },
  );
}

async function openAllSettingsMainReference(page: Page): Promise<void> {
  if (!MAIN_REFERENCE_BASE_URL || !MAIN_REFERENCE_BOOTSTRAP_URL) {
    throw new Error(
      "Missing SETTA_MAIN_REFERENCE_URL or SETTA_MAIN_REFERENCE_BOOTSTRAP_URL.",
    );
  }

  await openAllSettingsPage(
    page,
    {
      baseUrl: MAIN_REFERENCE_BASE_URL,
      bootstrapUrl: MAIN_REFERENCE_BOOTSTRAP_URL,
      requireAppReady: false,
    },
    { rendererMode: null },
  );
}

test("settings workspace chrome reset hides stale project chat chrome without mutating the canary backend state", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  await page.evaluate(async () => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const { createProjectChatWindowInstance, createProjectChatWindowingState } =
      await import("/src/utils/generatedTypes.ts");

    useProjectState.setState({
      projectChatWindowing: createProjectChatWindowingState({
        order: ["project-chat-window-1"],
        nextInstanceNumber: 2,
        instancesById: {
          "project-chat-window-1": createProjectChatWindowInstance({
            instanceId: "project-chat-window-1",
            isClosed: false,
          }),
        },
      }),
    });
  });

  const projectChatWindowTitle = page.getByTestId("project-chat-window-title");
  await expect(projectChatWindowTitle).toContainText("Chat Window 1");
  const managerTrigger = page.getByTestId(
    "project-chat-bottom-dock-menu-trigger",
  );
  await expect(managerTrigger).toBeVisible();
  await managerTrigger.click();
  await expect(
    page.getByTestId("project-chat-bottom-dock-menu-content"),
  ).toBeVisible();
  await expect(
    page.getByTestId("project-chat-bottom-dock-menu-item"),
  ).toContainText("Chat Window 1");

  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await expect(projectChatWindowTitle).toHaveCount(0);
  expect(await readVisibleProjectChatChrome(page)).toEqual({
    bottomDockWindowCount: 0,
    floatingWindowCount: 0,
    managerMenuItemCount: 0,
    managerMenuVisible: false,
    maximizedWindowCount: 0,
    windowTitles: [],
  });
});

async function readViewportTransform(page: Page): Promise<ViewportTransform> {
  return page.evaluate(async (moduleUrl: string) => {
    const { useReactFlow } = await import(moduleUrl);
    const [x, y, zoom] = useReactFlow.getState().transform;
    return { x, y, zoom };
  }, REACT_FLOW_STORE_MODULE_URL);
}

async function readFitViewInitState(page: Page): Promise<{
  fitViewOnInit: boolean;
  fitViewOnInitDone: boolean;
}> {
  return page.evaluate(async (moduleUrl: string) => {
    const { useReactFlow } = await import(moduleUrl);
    const { fitViewOnInit, fitViewOnInitDone } = useReactFlow.getState();
    return { fitViewOnInit, fitViewOnInitDone };
  }, REACT_FLOW_STORE_MODULE_URL);
}

async function readNotificationMessages(page: Page): Promise<string[]> {
  return page.evaluate(async (moduleUrl: string) => {
    const { useNotifications } = await import(moduleUrl);
    return useNotifications
      .getState()
      .notifications.map((notification: { message: string }) => {
        return notification.message;
      });
  }, NOTIFICATIONS_STORE_MODULE_URL);
}

async function expectViewportTransformNear(
  page: Page,
  expected: ViewportTransform,
): Promise<void> {
  await expect
    .poll(async () => {
      const current = await readViewportTransform(page);
      return (
        Math.abs(current.x - expected.x) <= 2 &&
        Math.abs(current.y - expected.y) <= 2 &&
        Math.abs(current.zoom - expected.zoom) <= 0.0001
      );
    })
    .toBe(true);
}

async function readFirstSceneCanvasMetrics(page: Page): Promise<{
  cssHeight: number;
  cssWidth: number;
  pixelHeight: number;
  pixelWidth: number;
} | null> {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      "[data-live-dict-area-scene='pixi'] canvas",
    );
    if (!canvas) {
      return null;
    }

    return {
      cssHeight: canvas.clientHeight,
      cssWidth: canvas.clientWidth,
      pixelHeight: canvas.height,
      pixelWidth: canvas.width,
    };
  });
}

async function expectZoomOutButtonDisabled(
  page: Page,
  expectedDisabled: boolean,
): Promise<void> {
  const zoomOutButton = page.getByRole("button", { name: "zoom out" });

  await expect
    .poll(async () => {
      return zoomOutButton.isDisabled();
    })
    .toBe(expectedDisabled);
}

async function zoomViewportOutToMin(page: Page): Promise<void> {
  await page.waitForSelector(READY_SELECTOR);
  await page.waitForSelector("[data-live-dict-area-scene='pixi']");

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const clickResult = await page.evaluate(() => {
      const zoomOutButton = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button"),
      ).find((button) => button.getAttribute("aria-label") === "zoom out");

      if (!zoomOutButton) {
        return "missing";
      }
      if (zoomOutButton.disabled) {
        return "done";
      }

      zoomOutButton.click();
      return "clicked";
    });

    if (clickResult === "missing") {
      throw new Error("Missing zoom out button.");
    }
    if (clickResult === "done") {
      return;
    }

    await page.waitForTimeout(50);
  }

  throw new Error("Unable to reach the minimum viewport zoom.");
}

async function readScenePresentationModes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-live-dict-area-scene='pixi']",
      ),
    )
      .filter((sceneRoot) => {
        const rect = sceneRoot.getBoundingClientRect();
        const rowCount = Number.parseInt(
          sceneRoot.getAttribute("data-live-dict-area-scene-row-count") ?? "0",
          10,
        );

        return (
          rowCount > 0 &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight
        );
      })
      .map(
        (sceneRoot) =>
          sceneRoot.getAttribute(
            "data-live-dict-area-scene-presentation-mode",
          ) ?? "detail",
      )
      .slice(0, 6);
  });
}

async function readVisibleSceneReadableRows(page: Page): Promise<
  Array<{
    left: number;
    readableRowCount: number;
    sectionId: string;
    sectionName: string;
    top: number;
    valuePreviewCount: number;
  }>
> {
  return page.evaluate(() => {
    return import("/src/state/definitions.ts").then(({ useProjectState }) => {
      const sections = useProjectState.getState().sections;

      return Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-id]",
        ),
      )
        .map((sceneRoot) => {
          const rect = sceneRoot.getBoundingClientRect();
          const sectionId =
            sceneRoot.getAttribute("data-live-dict-area-scene-section-id") ??
            "";

          return {
            left: rect.left,
            readableRowCount: Number.parseInt(
              sceneRoot.getAttribute(
                "data-live-dict-area-scene-readable-row-count",
              ) ?? "0",
              10,
            ),
            sectionId,
            sectionName: sections[sectionId]?.name ?? "",
            top: rect.top,
            valuePreviewCount: Number.parseInt(
              sceneRoot.getAttribute(
                "data-live-dict-area-scene-value-preview-count",
              ) ?? "0",
              10,
            ),
            visible:
              rect.width > 0 &&
              rect.height > 0 &&
              rect.bottom > 0 &&
              rect.top < window.innerHeight,
          };
        })
        .filter((sceneRoot) => sceneRoot.visible)
        .sort((leftScene, rightScene) => {
          if (Math.abs(leftScene.top - rightScene.top) > 2) {
            return leftScene.top - rightScene.top;
          }

          return leftScene.left - rightScene.left;
        })
        .map(
          ({
            left,
            readableRowCount,
            sectionId,
            sectionName,
            top,
            valuePreviewCount,
          }) => ({
            left,
            readableRowCount,
            sectionId,
            sectionName,
            top,
            valuePreviewCount,
          }),
        );
    });
  });
}

async function readVisibleScenePaletteSamples(
  page: Page,
): Promise<VisibleScenePaletteSample[]> {
  return page.evaluate(() => {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-id]",
      ),
    )
      .map((sceneRoot) => {
        const rect = sceneRoot.getBoundingClientRect();
        const panelBackground =
          sceneRoot.dataset.liveDictAreaScenePanelBackground ?? "";
        const rowBackground =
          sceneRoot.dataset.liveDictAreaSceneRowBackground ?? "";

        return {
          left: rect.left,
          panelBackground,
          rowBackground,
          sectionId:
            sceneRoot.getAttribute("data-live-dict-area-scene-section-id") ??
            "",
          top: rect.top,
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight &&
            panelBackground.length > 0 &&
            rowBackground.length > 0,
        };
      })
      .filter((sceneRoot) => sceneRoot.visible)
      .sort((leftScene, rightScene) => {
        if (Math.abs(leftScene.top - rightScene.top) > 2) {
          return leftScene.top - rightScene.top;
        }

        return leftScene.left - rightScene.left;
      })
      .map(({ left, panelBackground, rowBackground, sectionId, top }) => ({
        left,
        panelBackground,
        rowBackground,
        sectionId,
        top,
      }));
  });
}

async function readLiveDictAreaPageRuntimeSnapshot(
  page: Page,
): Promise<LiveDictAreaPageRuntimeSnapshot> {
  return page.evaluate(async () => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const sectionsById = useProjectState.getState().sections;
    const host = document.querySelector<HTMLElement>(
      "[data-live-dict-area-pixi-page-runtime-host='true']",
    );
    if (!host) {
      return {
        count: 0,
        contextLost: false,
        domContextLostCount: 0,
        domContextLostSectionNames: [],
        domContextLostSections: [],
        hostPresent: false,
        managedSceneName: "",
        managedSceneNames: [],
        pixiCount: 0,
        sectionNames: [],
        sections: [],
      };
    }

    const parseCount = (attributeName: string) => {
      const rawValue = host.getAttribute(attributeName);
      const nextCount = rawValue ? Number.parseInt(rawValue, 10) : 0;
      return Number.isFinite(nextCount) ? nextCount : 0;
    };

    const sectionIds = (
      host.getAttribute("data-live-dict-area-pixi-runtime-scenes") ?? ""
    )
      .split(",")
      .filter((sectionId) => sectionId.length > 0);

    return {
      count: parseCount("data-live-dict-area-pixi-runtime-count"),
      contextLost:
        host.getAttribute("data-live-dict-area-pixi-runtime-context-lost") ===
        "true",
      domContextLostCount: parseCount(
        "data-live-dict-area-pixi-runtime-dom-context-lost-count",
      ),
      domContextLostSectionNames: (
        host.getAttribute(
          "data-live-dict-area-pixi-runtime-dom-context-lost-scene-names",
        ) ?? ""
      )
        .split(",")
        .filter((sectionName) => sectionName.length > 0),
      domContextLostSections: (
        host.getAttribute(
          "data-live-dict-area-pixi-runtime-dom-context-lost-scenes",
        ) ?? ""
      )
        .split(",")
        .filter((sectionId) => sectionId.length > 0),
      hostPresent: true,
      managedSceneName:
        host.getAttribute(
          "data-live-dict-area-pixi-runtime-managed-scene-name",
        ) ?? "",
      managedSceneNames: (
        host.getAttribute(
          "data-live-dict-area-pixi-runtime-managed-scene-names",
        ) ?? ""
      )
        .split(",")
        .filter((sectionName) => sectionName.length > 0),
      pixiCount: parseCount("data-live-dict-area-pixi-runtime-pixi-count"),
      sectionNames: sectionIds.map(
        (sectionId) => sectionsById[sectionId]?.name ?? "",
      ),
      sections: sectionIds,
    };
  });
}

async function readVisibleSceneWindowOptimality(
  page: Page,
  sectionNames: string[],
): Promise<
  Array<{
    optimalReadableRowCount: number;
    optimalValuePreviewCount: number;
    readableRowCount: number;
    sectionName: string;
    valuePreviewCount: number;
  }>
> {
  return page.evaluate(async (targetSectionNames) => {
    const { useProjectState, useMisc, useSettings } = await import(
      "/src/state/definitions.ts"
    );
    const { getCurrEffectiveSectionImpl } = await import(
      "/src/state/actions/sectionInfos.ts"
    );
    const { buildLiveDictAreaSectionBoundary } = await import(
      "/src/components/Params/groupContainerLiveDictAreaSectionBoundary.ts"
    );
    const { buildLiveDictAreaBoundary } = await import(
      "/src/components/Params/groupContainerLiveDictAreaBoundary.ts"
    );

    const state = useProjectState.getState();
    const targetSectionNameSet = new Set(targetSectionNames);
    const visibleTargetScenes = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-id]",
      ),
    )
      .map((sceneRoot) => {
        const rect = sceneRoot.getBoundingClientRect();
        const sectionId =
          sceneRoot.getAttribute("data-live-dict-area-scene-section-id") ?? "";
        const sectionName = state.sections[sectionId]?.name ?? "";

        return {
          readableRowCount: Number.parseInt(
            sceneRoot.getAttribute(
              "data-live-dict-area-scene-readable-row-count",
            ) ?? "0",
            10,
          ),
          rowCount: Number.parseInt(
            sceneRoot.getAttribute("data-live-dict-area-scene-row-count") ??
              "0",
            10,
          ),
          sectionId,
          sectionName,
          valuePreviewCount: Number.parseInt(
            sceneRoot.getAttribute(
              "data-live-dict-area-scene-value-preview-count",
            ) ?? "0",
            10,
          ),
          visible:
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.top < window.innerHeight,
        };
      })
      .filter(
        (scene) =>
          scene.visible &&
          scene.rowCount > 0 &&
          targetSectionNameSet.has(scene.sectionName),
      );

    return visibleTargetScenes.map((scene) => {
      const sectionImpl = getCurrEffectiveSectionImpl(state, scene.sectionId);
      const liveDictAreaBoundary = buildLiveDictAreaBoundary(
        buildLiveDictAreaSectionBoundary({
          bgColor: "bg-surface",
          canEditLayout: true,
          canEditStructure: true,
          handleColumnResizeStart: () => undefined,
          isSelectingParams: useMisc.getState().isSelectingParams,
          sectionId: scene.sectionId,
          sectionTypeName: sectionImpl.type,
          state,
          unpinnedParamsAreaMinHeight:
            useSettings.getState().sectionSizingPolicy.globals
              .unpinnedParamsAreaMinHeight,
        }),
      );
      const rows = liveDictAreaBoundary.scenePacket.paramAreas.flatMap(
        (paramArea) => paramArea.rows,
      );
      let optimalReadableRowCount = scene.readableRowCount;
      let optimalValuePreviewCount = scene.valuePreviewCount;

      for (
        let previewStartIndex = 0;
        previewStartIndex <= rows.length - scene.rowCount;
        previewStartIndex += 1
      ) {
        const candidateRows = rows.slice(
          previewStartIndex,
          previewStartIndex + scene.rowCount,
        );
        const candidateReadableRowCount = candidateRows.filter(
          (row) => row.kind !== "group",
        ).length;
        const candidateValuePreviewCount = candidateRows.filter(
          (row) => row.kind === "value" && row.valuePreview !== null,
        ).length;

        if (
          candidateReadableRowCount > optimalReadableRowCount ||
          (candidateReadableRowCount === optimalReadableRowCount &&
            candidateValuePreviewCount > optimalValuePreviewCount)
        ) {
          optimalReadableRowCount = candidateReadableRowCount;
          optimalValuePreviewCount = candidateValuePreviewCount;
        }
      }

      return {
        optimalReadableRowCount,
        optimalValuePreviewCount,
        readableRowCount: scene.readableRowCount,
        sectionName: scene.sectionName,
        valuePreviewCount: scene.valuePreviewCount,
      };
    });
  }, sectionNames);
}

async function waitForVisibleSceneMetrics(page: Page): Promise<{
  firstVisibleSceneRootWidth: number;
  firstVisibleSceneRootX: number;
  viewportWidth: number;
  visibleSceneCanvasCount: number;
  visibleSceneRootCount: number;
}> {
  const visibleSceneMetrics = await page.waitForFunction(() => {
    const visibleSceneRoots = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-live-dict-area-render-mode='pixi-node-body']",
      ),
    ).filter((sceneRoot) => {
      const rect = sceneRoot.getBoundingClientRect();

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth
      );
    });

    if (visibleSceneRoots.length === 0) {
      return null;
    }

    const firstVisibleSceneRoot = visibleSceneRoots[0];
    const firstVisibleSceneRootRect =
      firstVisibleSceneRoot.getBoundingClientRect();

    return {
      firstVisibleSceneRootWidth: firstVisibleSceneRootRect.width,
      firstVisibleSceneRootX: firstVisibleSceneRootRect.x,
      viewportWidth: window.innerWidth,
      visibleSceneCanvasCount: visibleSceneRoots.reduce(
        (count, sceneRoot) =>
          count + sceneRoot.querySelectorAll("canvas").length,
        0,
      ),
      visibleSceneRootCount: visibleSceneRoots.length,
    };
  });

  return (await visibleSceneMetrics.jsonValue())!;
}

async function readVisibleBlockBounds(
  page: Page,
  source: "baseline" | "pixi",
  blockId: string,
): Promise<VisibleBlockBounds[]> {
  return page.evaluate(
    ({ blockId: targetBlockId, source: targetSource }) => {
      const selector =
        targetSource === "baseline"
          ? `[data-dict-area-block-id='${targetBlockId}']`
          : `[data-live-dict-area-scene-block-anchor='true'][data-live-dict-area-scene-block-id='${targetBlockId}']`;

      return Array.from(document.querySelectorAll<HTMLElement>(selector))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const sectionId =
            targetSource === "baseline"
              ? element
                  .closest<HTMLElement>("[data-section-id]")
                  ?.getAttribute("data-section-id") ?? ""
              : element.getAttribute("data-live-dict-area-scene-section-id") ??
                "";

          return {
            blockId: targetBlockId,
            height: rect.height,
            sectionId,
            width: rect.width,
            x: rect.x,
            y: rect.y,
          };
        })
        .filter((block) => {
          return (
            block.sectionId.length > 0 &&
            block.width > 0 &&
            block.height > 0 &&
            block.x < window.innerWidth &&
            block.y < window.innerHeight &&
            block.x + block.width > 0 &&
            block.y + block.height > 0
          );
        })
        .sort((a, b) => {
          if (a.y !== b.y) {
            return a.y - b.y;
          }
          return a.x - b.x;
        });
    },
    {
      blockId,
      source,
    },
  );
}

async function readVisibleSectionNodeBounds(
  page: Page,
): Promise<VisibleSectionNodeBounds[]> {
  return page.evaluate(async () => {
    const { useProjectState } = await import("/src/state/definitions.ts");
    const sections = useProjectState.getState().sections;

    return Array.from(
      document.querySelectorAll<HTMLElement>(".react-flow__node[data-id]"),
    )
      .map((element) => {
        const sectionId = element.getAttribute("data-id") ?? "";
        const rect = element.getBoundingClientRect();
        return {
          height: rect.height,
          sectionId,
          sectionName: sections[sectionId]?.name ?? "",
          width: rect.width,
          x: rect.x,
          y: rect.y,
        };
      })
      .filter((node) => {
        return (
          node.sectionId.length > 0 &&
          node.sectionName.length > 0 &&
          node.width > 0 &&
          node.height > 0 &&
          node.x < window.innerWidth &&
          node.y < window.innerHeight &&
          node.x + node.width > 0 &&
          node.y + node.height > 0
        );
      })
      .sort((a, b) => {
        if (a.y !== b.y) {
          return a.y - b.y;
        }
        return a.x - b.x;
      });
  });
}

async function readVisibleOverviewSectionLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const scrollContainer = document.querySelector<HTMLElement>(
      "#OverviewPane .setta-pane-scroll",
    );
    if (!scrollContainer) {
      return [];
    }

    const viewportRect = scrollContainer.getBoundingClientRect();
    return Array.from(
      document.querySelectorAll<HTMLElement>("#OverviewPane li"),
    )
      .map((element) => {
        const label = element
          .querySelector<HTMLElement>("span.min-w-0.flex-1.truncate")
          ?.textContent?.trim();
        const rect = element.getBoundingClientRect();
        return {
          label: label ?? "",
          top: rect.top,
          visible:
            rect.height > 0 &&
            rect.bottom > viewportRect.top &&
            rect.top < viewportRect.bottom,
        };
      })
      .filter((entry) => entry.visible && entry.label.length > 0)
      .sort((left, right) => left.top - right.top)
      .map((entry) => entry.label);
  });
}

async function normalizeAllSettingsOverviewLayout(page: Page): Promise<void> {
  await page.evaluate(
    async ({
      gridColumns,
      gridSpacing,
    }: {
      gridColumns: number;
      gridSpacing: number;
    }) => {
      const { useProjectState } = await import("/src/state/definitions.ts");
      const { createSettingsState, createTopLevelSectionLayout } = await import(
        "/src/utils/generatedTypes.ts"
      );

      const state = useProjectState.getState();
      const activeViewModeId = state.projectConfig.activeViewModeId;
      if (!activeViewModeId) {
        throw new Error("Active view mode is not set.");
      }
      const activeViewMode = state.projectConfig.viewModes[activeViewModeId];
      if (!activeViewMode || activeViewMode.name !== "All Settings") {
        return;
      }

      const sectionIdByName = Object.fromEntries(
        Object.entries(state.sections).map(([sectionId, sectionCore]) => [
          sectionCore.name,
          sectionId,
        ]),
      );
      const orderedSectionNames = Object.keys(createSettingsState());
      const nextLayout = Object.fromEntries(
        orderedSectionNames.map((sectionName, index) => {
          const sectionId = sectionIdByName[sectionName];
          if (!sectionId) {
            throw new Error(
              `Missing settings section for All Settings normalization: ${sectionName}`,
            );
          }
          return [
            sectionId,
            createTopLevelSectionLayout({
              x: (index % gridColumns) * gridSpacing,
              y: Math.floor(index / gridColumns) * gridSpacing,
            }),
          ];
        }),
      );

      useProjectState.setState((currentState) => {
        currentState.projectConfig.topLevelSections = nextLayout;
        currentState.projectConfig.viewModes[
          activeViewModeId
        ].topLevelSections = nextLayout;
      });
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    },
    {
      gridColumns: SETTINGS_LAYOUT_GRID_COLUMNS,
      gridSpacing: SETTINGS_LAYOUT_GRID_SPACING,
    },
  );
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
    const visibleSceneRoots = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-live-dict-area-render-mode='pixi-node-body']",
      ),
    ).filter((sceneRoot) => {
      const rect = sceneRoot.getBoundingClientRect();

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight
      );
    });
    const visibleSceneRoot = visibleSceneRoots.find((sceneRoot) => {
      const sceneHost = sceneRoot.querySelector<HTMLElement>(
        "[data-live-dict-area-scene='pixi']",
      );
      const sceneCanvas = sceneHost?.querySelector("canvas");
      if (!sceneHost || !sceneCanvas) {
        return false;
      }

      const rowCount = Number.parseInt(
        sceneHost.getAttribute("data-live-dict-area-scene-row-count") ?? "0",
        10,
      );

      return rowCount > 0;
    });
    if (!visibleSceneRoot) {
      return null;
    }

    const sceneHost = visibleSceneRoot.querySelector<HTMLElement>(
      "[data-live-dict-area-scene='pixi']",
    );
    const sceneCanvas = sceneHost?.querySelector("canvas");
    if (!sceneHost || !sceneCanvas) {
      return null;
    }

    return {
      availableHeight: Number.parseInt(
        sceneHost.getAttribute("data-live-dict-area-scene-available-height") ??
          "0",
        10,
      ),
      canvasCssHeight: sceneCanvas.getBoundingClientRect().height,
      compactRowHorizontalPadding: Number.parseFloat(
        sceneHost.getAttribute(
          "data-live-dict-area-scene-compact-row-horizontal-padding",
        ) ?? "0",
      ),
      compactRowRadius: Number.parseFloat(
        sceneHost.getAttribute(
          "data-live-dict-area-scene-compact-row-radius",
        ) ?? "0",
      ),
      compactRowSurface: sceneHost.getAttribute(
        "data-live-dict-area-scene-compact-row-surface",
      ),
      presentationMode:
        sceneHost.getAttribute("data-live-dict-area-scene-presentation-mode") ??
        "detail",
      localParamContainerCount: visibleSceneRoot.querySelectorAll(
        '[id^="ParamContainer-"]',
      ).length,
      sceneRootCssHeight: visibleSceneRoot.getBoundingClientRect().height,
      valuePreviewCount: Number.parseInt(
        sceneHost.getAttribute(
          "data-live-dict-area-scene-value-preview-count",
        ) ?? "0",
        10,
      ),
      rowCount: Number.parseInt(
        sceneHost.getAttribute("data-live-dict-area-scene-row-count") ?? "0",
        10,
      ),
      sceneBlockCount: Number.parseInt(
        sceneHost.getAttribute("data-live-dict-area-scene-block-count") ?? "0",
        10,
      ),
      visibleSceneRootCount: visibleSceneRoots.length,
    };
  });

  const result = await metrics.jsonValue();
  const visibleHandoffAriaLabels = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        "[data-live-dict-area-editor-handoff='value-row']",
      ),
    )
      .filter((button) => {
        const rect = button.getBoundingClientRect();

        return (
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight
        );
      })
      .slice(0, 4)
      .map((button) => button.getAttribute("aria-label") ?? ""),
  );

  expect(result).not.toBeNull();
  expect(result?.visibleSceneRootCount).toBeGreaterThan(0);
  expect(result?.sceneBlockCount).toBeGreaterThan(0);
  expect(result?.rowCount).toBeGreaterThan(0);
  expect(result?.valuePreviewCount).toBeGreaterThan(0);
  expect(result?.availableHeight).toBeGreaterThan(0);
  if (result?.presentationMode === "overview") {
    expect(result?.canvasCssHeight).toBeGreaterThan(0);
  } else {
    expect(result?.canvasCssHeight).toBeGreaterThanOrEqual(
      LIVE_DICT_AREA_PIXI_MIN_USABLE_CANVAS_HEIGHT,
    );
  }
  expect(result?.canvasCssHeight).toBeLessThanOrEqual(
    (result?.sceneRootCssHeight ?? 0) + 1,
  );
  expect(result?.compactRowSurface).toBe("transparent");
  expect(result?.compactRowRadius).toBe(2);
  expect(result?.compactRowHorizontalPadding).toBe(2);
  expect(result?.localParamContainerCount).toBe(0);
  expect(visibleHandoffAriaLabels.length).toBeGreaterThan(0);
  expect(
    visibleHandoffAriaLabels.every(
      (ariaLabel) =>
        ariaLabel.length > 0 &&
        !ariaLabel.startsWith("Activate editor overlay for "),
    ),
  ).toBe(true);
});

test("all settings canary does not add an initial connected notification on first load", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  await expect
    .poll(async () => {
      return (await readNotificationMessages(page)).includes(
        "Connected to server",
      );
    })
    .toBe(false);
});

test("all settings canary keeps visible Pixi scene roots after switching from the baseline in the same tab", async ({
  page,
}) => {
  await openAllSettingsBaseline(page);
  await openAllSettingsLivePixiCanary(page);

  const visibleSceneMetrics = await waitForVisibleSceneMetrics(page);

  expect(visibleSceneMetrics.visibleSceneRootCount).toBeGreaterThan(0);
  expect(visibleSceneMetrics.visibleSceneCanvasCount).toBeGreaterThan(0);
  expect(visibleSceneMetrics.firstVisibleSceneRootWidth).toBeGreaterThan(0);
  expect(visibleSceneMetrics.firstVisibleSceneRootX).toBeLessThan(
    visibleSceneMetrics.viewportWidth,
  );
});

test("all settings canary rerenders the Pixi scene canvas when the viewport zoom changes", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const resetZoomButton = page.getByRole("button", { name: "reset zoom" });
  await expect(resetZoomButton).toBeVisible();
  await resetZoomButton.click();

  const sceneCanvas = page
    .locator("[data-live-dict-area-scene='pixi'] canvas")
    .first();
  await expect(sceneCanvas).toBeVisible();
  const readCanvasMetrics = () =>
    sceneCanvas.evaluate((canvas) => ({
      cssHeight: canvas.clientHeight,
      cssWidth: canvas.clientWidth,
      pixelHeight: canvas.height,
      pixelWidth: canvas.width,
    }));
  await page.waitForTimeout(1500);

  const resetCanvasMetrics = await readCanvasMetrics();

  const initialCanvasWidth = resetCanvasMetrics.pixelWidth;
  expect(resetCanvasMetrics.cssHeight).toBeGreaterThan(0);
  expect(resetCanvasMetrics.cssWidth).toBeGreaterThan(0);
  expect(resetCanvasMetrics.pixelHeight).toBeGreaterThan(0);
  expect(resetCanvasMetrics.pixelWidth).toBeGreaterThan(0);

  const zoomInButton = page.getByRole("button", { name: "zoom in" });
  await expect(zoomInButton).toBeVisible();
  await zoomInButton.click();

  await expect
    .poll(() => sceneCanvas.evaluate((canvas) => canvas.width), {
      message: "expected the Pixi scene canvas to redraw at a new zoom",
    })
    .toBeGreaterThan(initialCanvasWidth);

  const zoomedCanvasMetrics = await sceneCanvas.evaluate((canvas) => ({
    cssHeight: canvas.clientHeight,
    cssWidth: canvas.clientWidth,
    pixelHeight: canvas.height,
    pixelWidth: canvas.width,
  }));

  expect(zoomedCanvasMetrics.cssHeight).toBeGreaterThan(0);
  expect(zoomedCanvasMetrics.cssWidth).toBeGreaterThan(0);
  expect(zoomedCanvasMetrics.pixelHeight).toBeGreaterThan(0);
  expect(zoomedCanvasMetrics.pixelWidth).toBeGreaterThan(initialCanvasWidth);
  expect(
    zoomedCanvasMetrics.pixelWidth * zoomedCanvasMetrics.pixelHeight,
  ).toBeLessThanOrEqual(LIVE_DICT_AREA_PIXI_MAX_BACKING_PIXELS);
});

test("all settings canary falls back to the DOM mount when a live Pixi canvas loses its WebGL context", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await waitForVisibleSceneMetrics(page);

  const contextLossPrevented = await page.evaluate(() => {
    const visibleCanvas = Array.from(
      document.querySelectorAll<HTMLCanvasElement>(
        "[data-live-dict-area-scene='pixi'] canvas",
      ),
    ).find((canvas) => {
      const rect = canvas.getBoundingClientRect();
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.left < window.innerWidth &&
        rect.top < window.innerHeight
      );
    });

    if (!visibleCanvas) {
      return null;
    }

    const contextLossEvent = new Event("webglcontextlost", {
      cancelable: true,
    });
    visibleCanvas.dispatchEvent(contextLossEvent);
    return contextLossEvent.defaultPrevented;
  });

  expect(contextLossPrevented).toBe(true);

  const domFallback = page.locator(
    "[data-live-dict-area-scene-fallback='dom-context-lost']",
  );
  await expect(domFallback.first()).toBeVisible();
  await expect(
    domFallback.locator("[data-param-row='true']").first(),
  ).toBeVisible();
});

test("all settings canary keeps low-zoom live Pixi cards in detail mode by default", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await zoomViewportOutToMin(page);

  await expect
    .poll(async () => {
      const modes = await readScenePresentationModes(page);
      return modes.length > 0 && modes.every((mode) => mode === "detail");
    })
    .toBe(true);
});

test("all settings canary keeps the first visible low-zoom Pixi cards from collapsing to group-only previews", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await waitForVisibleSceneMetrics(page);
  await zoomViewportOutToMin(page);

  await expect
    .poll(async () => {
      const visibleScenes = await readVisibleSceneReadableRows(page);
      return (
        visibleScenes.length >= 6 &&
        visibleScenes.slice(0, 6).every((scene) => scene.readableRowCount > 0)
      );
    })
    .toBe(true);
});

test("all settings canary prefers populated same-height value-preview windows in deeper low-zoom Pixi cards", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await normalizeAllSettingsOverviewLayout(page);
  await clearCurrentProjectViewportForRefit(page);
  await waitForVisibleSceneMetrics(page);
  await expectZoomOutButtonDisabled(page, true);

  const promptOverviewItem = page
    .locator("#OverviewPane li")
    .filter({ hasText: "promptSectionDefault" });
  await expect(promptOverviewItem).toBeVisible();
  await promptOverviewItem.click();

  await expect
    .poll(async () => {
      const diagnostics = await readVisibleSceneWindowOptimality(page, [
        "pluginSectionDefault",
        "promptSectionDefault",
      ]);

      return (
        diagnostics.length === 2 &&
        diagnostics.every(
          (scene) =>
            scene.readableRowCount === scene.optimalReadableRowCount &&
            scene.valuePreviewCount === scene.optimalValuePreviewCount,
        )
      );
    })
    .toBe(true);
});

test("all settings canary mounts one shared page runtime host and tracks visible scene shells", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await normalizeAllSettingsOverviewLayout(page);
  await waitForVisibleSceneMetrics(page);

  await expect
    .poll(async () => {
      const runtime = await readLiveDictAreaPageRuntimeSnapshot(page);
      return (
        runtime.hostPresent && runtime.count > 0 && runtime.sections.length > 0
      );
    })
    .toBe(true);

  const promptOverviewItem = page
    .locator("#OverviewPane li")
    .filter({ hasText: "promptSectionDefault" });
  await expect(promptOverviewItem).toBeVisible();
  await promptOverviewItem.click();

  await expect
    .poll(async () => {
      const runtime = await readLiveDictAreaPageRuntimeSnapshot(page);
      return runtime.sectionNames.includes("promptSectionDefault");
    })
    .toBe(true);
});

test("all settings canary keeps promptSectionDefault on the shared page runtime without dom-context-lost", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await normalizeAllSettingsOverviewLayout(page);
  await waitForVisibleSceneMetrics(page);

  const promptOverviewItem = page
    .locator("#OverviewPane li")
    .filter({ hasText: "promptSectionDefault" });
  await expect(promptOverviewItem).toBeVisible();
  await promptOverviewItem.click();

  await expect
    .poll(async () => {
      const runtime = await readLiveDictAreaPageRuntimeSnapshot(page);
      return `${runtime.contextLost}:${runtime.managedSceneName}:${runtime.domContextLostSectionNames.includes("promptSectionDefault")}`;
    })
    .toBe("true:promptSectionDefault:false");

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const sceneRoot = document.querySelector<HTMLElement>(
          "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-name='promptSectionDefault']",
        );
        if (!sceneRoot) {
          return "missing";
        }

        const rect = sceneRoot.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        const hasContextLossFallback =
          sceneRoot.parentElement?.querySelector(
            "[data-live-dict-area-scene-fallback='dom-context-lost']",
          ) !== null;

        return `${visible}:${hasContextLossFallback}:${sceneRoot.getAttribute("data-live-dict-area-scene-render-backend") ?? ""}`;
      });
    })
    .toBe("true:false:shared-page-runtime");
});

test("all settings canary keeps browserSectionDefault on the shared page runtime without dom-context-lost", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await normalizeAllSettingsOverviewLayout(page);
  await waitForVisibleSceneMetrics(page);

  const browserOverviewItem = page
    .locator("#OverviewPane li")
    .filter({ hasText: "browserSectionDefault" });
  await expect(browserOverviewItem).toBeVisible();
  await browserOverviewItem.click();

  await expect
    .poll(async () => {
      const runtime = await readLiveDictAreaPageRuntimeSnapshot(page);
      return `${runtime.contextLost}:${runtime.managedSceneNames.includes("browserSectionDefault")}:${runtime.domContextLostSectionNames.includes("browserSectionDefault")}`;
    })
    .toBe("true:true:false");

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const sceneRoot = document.querySelector<HTMLElement>(
          "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-name='browserSectionDefault']",
        );
        if (!sceneRoot) {
          return "missing";
        }

        const rect = sceneRoot.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        const hasContextLossFallback =
          sceneRoot.parentElement?.querySelector(
            "[data-live-dict-area-scene-fallback='dom-context-lost']",
          ) !== null;

        return `${visible}:${hasContextLossFallback}:${sceneRoot.getAttribute("data-live-dict-area-scene-render-backend") ?? ""}`;
      });
    })
    .toBe("true:false:shared-page-runtime");
});

test("all settings canary keeps textBlockSectionDefault on the shared page runtime without dom-context-lost", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await normalizeAllSettingsOverviewLayout(page);
  await waitForVisibleSceneMetrics(page);

  const textBlockOverviewItem = page
    .locator("#OverviewPane li")
    .filter({ hasText: "textBlockSectionDefault" });
  await expect(textBlockOverviewItem).toBeVisible();
  await textBlockOverviewItem.click();

  await expect
    .poll(async () => {
      const runtime = await readLiveDictAreaPageRuntimeSnapshot(page);
      return `${runtime.contextLost}:${runtime.managedSceneNames.includes("textBlockSectionDefault")}:${runtime.domContextLostSectionNames.includes("textBlockSectionDefault")}`;
    })
    .toBe("true:true:false");

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const sceneRoot = document.querySelector<HTMLElement>(
          "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-name='textBlockSectionDefault']",
        );
        if (!sceneRoot) {
          return "missing";
        }

        const rect = sceneRoot.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        const hasContextLossFallback =
          sceneRoot.parentElement?.querySelector(
            "[data-live-dict-area-scene-fallback='dom-context-lost']",
          ) !== null;

        return `${visible}:${hasContextLossFallback}:${sceneRoot.getAttribute("data-live-dict-area-scene-render-backend") ?? ""}`;
      });
    })
    .toBe("true:false:shared-page-runtime");
});

test("all settings canary keeps codeParamCodeObjDefault on the shared page runtime without dom-context-lost", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await normalizeAllSettingsOverviewLayout(page);
  await waitForVisibleSceneMetrics(page);

  const codeParamOverviewItem = page
    .locator("#OverviewPane li")
    .filter({ hasText: "codeParamCodeObjDefault" });
  await expect(codeParamOverviewItem).toBeVisible();
  await codeParamOverviewItem.click();

  await expect
    .poll(async () => {
      const runtime = await readLiveDictAreaPageRuntimeSnapshot(page);
      return `${runtime.contextLost}:${runtime.managedSceneNames.includes("codeParamCodeObjDefault")}:${runtime.domContextLostSectionNames.includes("codeParamCodeObjDefault")}`;
    })
    .toBe("true:true:false");

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const sceneRoot = document.querySelector<HTMLElement>(
          "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-name='codeParamCodeObjDefault']",
        );
        if (!sceneRoot) {
          return "missing";
        }

        const rect = sceneRoot.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        const hasContextLossFallback =
          sceneRoot.parentElement?.querySelector(
            "[data-live-dict-area-scene-fallback='dom-context-lost']",
          ) !== null;

        return `${visible}:${hasContextLossFallback}:${sceneRoot.getAttribute("data-live-dict-area-scene-render-backend") ?? ""}`;
      });
    })
    .toBe("true:false:shared-page-runtime");
});

test("all settings canary keeps sectionSizingPolicy on the shared page runtime without dom-context-lost", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await normalizeAllSettingsOverviewLayout(page);
  await waitForVisibleSceneMetrics(page);

  const sectionSizingPolicyOverviewItem = page
    .locator("#OverviewPane li")
    .filter({ hasText: "sectionSizingPolicy" });
  await expect(sectionSizingPolicyOverviewItem).toBeVisible();
  await sectionSizingPolicyOverviewItem.click();

  await expect
    .poll(async () => {
      const runtime = await readLiveDictAreaPageRuntimeSnapshot(page);
      return `${runtime.contextLost}:${runtime.managedSceneNames.includes("sectionSizingPolicy")}:${runtime.domContextLostSectionNames.includes("sectionSizingPolicy")}`;
    })
    .toBe("true:true:false");

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const sceneRoot = document.querySelector<HTMLElement>(
          "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-name='sectionSizingPolicy']",
        );
        if (!sceneRoot) {
          return "missing";
        }

        const rect = sceneRoot.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        const hasContextLossFallback =
          sceneRoot.parentElement?.querySelector(
            "[data-live-dict-area-scene-fallback='dom-context-lost']",
          ) !== null;

        return `${visible}:${hasContextLossFallback}:${sceneRoot.getAttribute("data-live-dict-area-scene-render-backend") ?? ""}`;
      });
    })
    .toBe("true:false:shared-page-runtime");
});

test("all settings canary keeps buttonParamCodeObjDefault on the shared page runtime without dom-context-lost", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await normalizeAllSettingsOverviewLayout(page);
  await waitForVisibleSceneMetrics(page);

  const buttonParamOverviewItem = page
    .locator("#OverviewPane li")
    .filter({ hasText: "buttonParamCodeObjDefault" });
  await expect(buttonParamOverviewItem).toBeVisible();
  await buttonParamOverviewItem.click();

  await expect
    .poll(async () => {
      const runtime = await readLiveDictAreaPageRuntimeSnapshot(page);
      return `${runtime.contextLost}:${runtime.managedSceneNames.includes("buttonParamCodeObjDefault")}:${runtime.domContextLostSectionNames.includes("buttonParamCodeObjDefault")}`;
    })
    .toBe("true:true:false");

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const sceneRoot = document.querySelector<HTMLElement>(
          "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-name='buttonParamCodeObjDefault']",
        );
        if (!sceneRoot) {
          return "missing";
        }

        const rect = sceneRoot.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        const hasContextLossFallback =
          sceneRoot.parentElement?.querySelector(
            "[data-live-dict-area-scene-fallback='dom-context-lost']",
          ) !== null;

        return `${visible}:${hasContextLossFallback}:${sceneRoot.getAttribute("data-live-dict-area-scene-render-backend") ?? ""}`;
      });
    })
    .toBe("true:false:shared-page-runtime");
});

test("all settings canary keeps genPythonMetadataSectionDefault on the shared page runtime without dom-context-lost", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await normalizeAllSettingsOverviewLayout(page);
  await waitForVisibleSceneMetrics(page);

  const genPythonMetadataOverviewItem = page
    .locator("#OverviewPane li")
    .filter({ hasText: "genPythonMetadataSectionDefault" });
  await expect(genPythonMetadataOverviewItem).toBeVisible();
  await genPythonMetadataOverviewItem.click();

  await expect
    .poll(async () => {
      const runtime = await readLiveDictAreaPageRuntimeSnapshot(page);
      return `${runtime.contextLost}:${runtime.managedSceneNames.includes("genPythonMetadataSectionDefault")}:${runtime.domContextLostSectionNames.includes("genPythonMetadataSectionDefault")}`;
    })
    .toBe("true:true:false");

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const sceneRoot = document.querySelector<HTMLElement>(
          "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-name='genPythonMetadataSectionDefault']",
        );
        if (!sceneRoot) {
          return "missing";
        }

        const rect = sceneRoot.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        const hasContextLossFallback =
          sceneRoot.parentElement?.querySelector(
            "[data-live-dict-area-scene-fallback='dom-context-lost']",
          ) !== null;

        return `${visible}:${hasContextLossFallback}:${sceneRoot.getAttribute("data-live-dict-area-scene-render-backend") ?? ""}`;
      });
    })
    .toBe("true:false:shared-page-runtime");
});

test("all settings canary keeps drawSectionDefault on the shared page runtime without dom-context-lost", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await normalizeAllSettingsOverviewLayout(page);
  await waitForVisibleSceneMetrics(page);

  const drawOverviewItem = page
    .locator("#OverviewPane li")
    .filter({ hasText: "drawSectionDefault" });
  await expect(drawOverviewItem).toBeVisible();
  await drawOverviewItem.click();

  await expect
    .poll(async () => {
      const runtime = await readLiveDictAreaPageRuntimeSnapshot(page);
      return `${runtime.contextLost}:${runtime.managedSceneNames.includes("drawSectionDefault")}:${runtime.domContextLostSectionNames.includes("drawSectionDefault")}`;
    })
    .toBe("true:true:false");

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const sceneRoot = document.querySelector<HTMLElement>(
          "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-name='drawSectionDefault']",
        );
        if (!sceneRoot) {
          return "missing";
        }

        const rect = sceneRoot.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        const hasContextLossFallback =
          sceneRoot.parentElement?.querySelector(
            "[data-live-dict-area-scene-fallback='dom-context-lost']",
          ) !== null;

        return `${visible}:${hasContextLossFallback}:${sceneRoot.getAttribute("data-live-dict-area-scene-render-backend") ?? ""}`;
      });
    })
    .toBe("true:false:shared-page-runtime");
});

test("all settings canary keeps iFrameSectionDefault on the shared page runtime without dom-context-lost", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await normalizeAllSettingsOverviewLayout(page);
  await waitForVisibleSceneMetrics(page);

  const iframeOverviewItem = page
    .locator("#OverviewPane li")
    .filter({ hasText: "iFrameSectionDefault" });
  await expect(iframeOverviewItem).toBeVisible();
  await iframeOverviewItem.click();

  await expect
    .poll(async () => {
      const runtime = await readLiveDictAreaPageRuntimeSnapshot(page);
      return `${runtime.contextLost}:${runtime.managedSceneNames.includes("iFrameSectionDefault")}:${runtime.domContextLostSectionNames.includes("iFrameSectionDefault")}`;
    })
    .toBe("true:true:false");

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const sceneRoot = document.querySelector<HTMLElement>(
          "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-name='iFrameSectionDefault']",
        );
        if (!sceneRoot) {
          return "missing";
        }

        const rect = sceneRoot.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        const hasContextLossFallback =
          sceneRoot.parentElement?.querySelector(
            "[data-live-dict-area-scene-fallback='dom-context-lost']",
          ) !== null;

        return `${visible}:${hasContextLossFallback}:${sceneRoot.getAttribute("data-live-dict-area-scene-render-backend") ?? ""}`;
      });
    })
    .toBe("true:false:shared-page-runtime");
});

test("all settings canary keeps backend on the shared page runtime without dom-context-lost", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await normalizeAllSettingsOverviewLayout(page);
  await waitForVisibleSceneMetrics(page);

  const backendOverviewItem = page
    .locator("#OverviewPane li")
    .filter({ hasText: "backend" });
  await expect(backendOverviewItem).toBeVisible();
  await backendOverviewItem.click();

  await expect
    .poll(async () => {
      const runtime = await readLiveDictAreaPageRuntimeSnapshot(page);
      return `${runtime.contextLost}:${runtime.managedSceneNames.includes("backend")}:${runtime.domContextLostSectionNames.includes("backend")}`;
    })
    .toBe("true:true:false");

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const sceneRoot = document.querySelector<HTMLElement>(
          "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-name='backend']",
        );
        if (!sceneRoot) {
          return "missing";
        }

        const rect = sceneRoot.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        const hasContextLossFallback =
          sceneRoot.parentElement?.querySelector(
            "[data-live-dict-area-scene-fallback='dom-context-lost']",
          ) !== null;

        return `${visible}:${hasContextLossFallback}:${sceneRoot.getAttribute("data-live-dict-area-scene-render-backend") ?? ""}`;
      });
    })
    .toBe("true:false:shared-page-runtime");
});

test("all settings canary keeps stateMachineGateSectionDefault on the shared page runtime without dom-context-lost", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await normalizeAllSettingsOverviewLayout(page);
  await waitForVisibleSceneMetrics(page);

  const stateMachineGateOverviewItem = page
    .locator("#OverviewPane li")
    .filter({ hasText: "stateMachineGateSectionDefault" });
  await expect(stateMachineGateOverviewItem).toBeVisible();
  await stateMachineGateOverviewItem.click();

  await expect
    .poll(async () => {
      const runtime = await readLiveDictAreaPageRuntimeSnapshot(page);
      return `${runtime.contextLost}:${runtime.managedSceneNames.includes("stateMachineGateSectionDefault")}:${runtime.domContextLostSectionNames.includes("stateMachineGateSectionDefault")}`;
    })
    .toBe("true:true:false");

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const sceneRoot = document.querySelector<HTMLElement>(
          "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-name='stateMachineGateSectionDefault']",
        );
        if (!sceneRoot) {
          return "missing";
        }

        const rect = sceneRoot.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        const hasContextLossFallback =
          sceneRoot.parentElement?.querySelector(
            "[data-live-dict-area-scene-fallback='dom-context-lost']",
          ) !== null;

        return `${visible}:${hasContextLossFallback}:${sceneRoot.getAttribute("data-live-dict-area-scene-render-backend") ?? ""}`;
      });
    })
    .toBe("true:false:shared-page-runtime");
});

test("all settings canary keeps codeSectionDefault on the shared page runtime without fallback", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await normalizeAllSettingsOverviewLayout(page);
  await waitForVisibleSceneMetrics(page);

  const codeSectionOverviewItem = page
    .locator("#OverviewPane li")
    .filter({ hasText: /^codeSectionDefault$/ });
  await expect(codeSectionOverviewItem).toBeVisible();
  await codeSectionOverviewItem.click();

  await expect
    .poll(async () => {
      const runtime = await readLiveDictAreaPageRuntimeSnapshot(page);
      return `${runtime.contextLost}:${runtime.managedSceneNames.includes("codeSectionDefault")}:${runtime.domContextLostSectionNames.includes("codeSectionDefault")}`;
    })
    .toBe("true:true:false");

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const sceneRoot = document.querySelector<HTMLElement>(
          "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-name='codeSectionDefault']",
        );
        if (!sceneRoot) {
          return "missing";
        }

        const rect = sceneRoot.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        const hasContextLossFallback =
          sceneRoot.parentElement?.querySelector(
            "[data-live-dict-area-scene-fallback='dom-context-lost']",
          ) !== null;

        return `${visible}:${hasContextLossFallback}:${sceneRoot.getAttribute("data-live-dict-area-scene-render-backend") ?? ""}`;
      });
    })
    .toBe("true:false:shared-page-runtime");
});

test("all settings canary keeps chatSectionDefault on the shared page runtime without fallback", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await normalizeAllSettingsOverviewLayout(page);
  await waitForVisibleSceneMetrics(page);

  const chatSectionOverviewItem = page
    .locator("#OverviewPane li")
    .filter({ hasText: /^chatSectionDefault$/ });
  await expect(chatSectionOverviewItem).toBeVisible();
  await chatSectionOverviewItem.click();

  await expect
    .poll(async () => {
      const runtime = await readLiveDictAreaPageRuntimeSnapshot(page);
      return `${runtime.contextLost}:${runtime.managedSceneNames.includes("chatSectionDefault")}:${runtime.domContextLostSectionNames.includes("chatSectionDefault")}`;
    })
    .toBe("true:true:false");

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const sceneRoot = document.querySelector<HTMLElement>(
          "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-name='chatSectionDefault']",
        );
        if (!sceneRoot) {
          return "missing";
        }

        const rect = sceneRoot.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        const hasContextLossFallback =
          sceneRoot.parentElement?.querySelector(
            "[data-live-dict-area-scene-fallback='dom-context-lost']",
          ) !== null;

        return `${visible}:${hasContextLossFallback}:${sceneRoot.getAttribute("data-live-dict-area-scene-render-backend") ?? ""}`;
      });
    })
    .toBe("true:false:shared-page-runtime");
});

test("all settings canary keeps genPythonCodeSectionDefault on the shared page runtime without fallback", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);
  await normalizeAllSettingsOverviewLayout(page);
  await waitForVisibleSceneMetrics(page);

  const genPythonCodeSectionOverviewItem = page
    .locator("#OverviewPane li")
    .filter({ hasText: /^genPythonCodeSectionDefault$/ });
  await expect(genPythonCodeSectionOverviewItem).toBeVisible();
  await genPythonCodeSectionOverviewItem.click();

  await expect
    .poll(async () => {
      const runtime = await readLiveDictAreaPageRuntimeSnapshot(page);
      return `${runtime.contextLost}:${runtime.managedSceneNames.includes("genPythonCodeSectionDefault")}:${runtime.domContextLostSectionNames.includes("genPythonCodeSectionDefault")}`;
    })
    .toBe("true:true:false");

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const sceneRoot = document.querySelector<HTMLElement>(
          "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-name='genPythonCodeSectionDefault']",
        );
        if (!sceneRoot) {
          return "missing";
        }

        const rect = sceneRoot.getBoundingClientRect();
        const visible =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < window.innerHeight;
        const hasContextLossFallback =
          sceneRoot.parentElement?.querySelector(
            "[data-live-dict-area-scene-fallback='dom-context-lost']",
          ) !== null;

        return `${visible}:${hasContextLossFallback}:${sceneRoot.getAttribute("data-live-dict-area-scene-render-backend") ?? ""}`;
      });
    })
    .toBe("true:false:shared-page-runtime");
});

test("all settings canary keeps low-zoom live Pixi row chrome from falling back to bright generic fills inside dark cards", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await waitForVisibleSceneMetrics(page);
  await zoomViewportOutToMin(page);

  await expect
    .poll(async () => {
      const visibleScenes = await readVisibleScenePaletteSamples(page);
      const darkPanelScenes = visibleScenes
        .slice(0, 12)
        .map((scene) => ({
          panelLuminance: getColorLuminance(scene.panelBackground),
          rowLuminance: getColorLuminance(scene.rowBackground),
          sectionId: scene.sectionId,
        }))
        .filter(
          (scene) =>
            scene.panelLuminance !== null && scene.panelLuminance < 0.35,
        );

      return (
        darkPanelScenes.length >= 3 &&
        darkPanelScenes.every(
          (scene) =>
            scene.rowLuminance !== null &&
            scene.rowLuminance < 0.55 &&
            scene.rowLuminance - scene.panelLuminance < 0.25,
        )
      );
    })
    .toBe(true);
});

test("all settings canary keeps the true viewport zoom below 1x and the Pixi backing at least CSS-sized at minimum zoom", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const initialViewport = await readViewportTransform(page);
  expect(initialViewport.zoom).toBeGreaterThan(0);

  await zoomViewportOutToMin(page);
  await expectZoomOutButtonDisabled(page, true);

  await expect
    .poll(async () => (await readViewportTransform(page)).zoom)
    .toBeLessThan(1);

  const minZoomViewport = await readViewportTransform(page);
  const canvasMetrics = await readFirstSceneCanvasMetrics(page);

  expect(minZoomViewport.zoom).toBeLessThanOrEqual(initialViewport.zoom);
  expect(canvasMetrics).not.toBeNull();
  expect(canvasMetrics?.cssHeight).toBeGreaterThan(0);
  expect(canvasMetrics?.cssWidth).toBeGreaterThan(0);
  expect(canvasMetrics?.pixelHeight).toBeGreaterThanOrEqual(
    canvasMetrics?.cssHeight ?? 0,
  );
  expect(canvasMetrics?.pixelWidth).toBeGreaterThanOrEqual(
    canvasMetrics?.cssWidth ?? 0,
  );
  expect(
    (canvasMetrics?.pixelWidth ?? 0) * (canvasMetrics?.pixelHeight ?? 0),
  ).toBeLessThanOrEqual(LIVE_DICT_AREA_PIXI_MAX_BACKING_PIXELS);
});

test("all settings canary restores low-zoom overview mode only for the explicit opt-in query param", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page, {
    overviewEnabled: true,
  });
  await zoomViewportOutToMin(page);

  await expect
    .poll(async () => {
      const modes = await readScenePresentationModes(page);
      return modes.length > 0 && modes.every((mode) => mode === "overview");
    })
    .toBe(true);
});

test("all settings canary exposes stable section anchors on visible Pixi scene roots", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const visibleSceneAnchors = await page.waitForFunction(() => {
    const sceneRoots = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-id]",
      ),
    ).filter((sceneRoot) => {
      const rect = sceneRoot.getBoundingClientRect();

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom > 0 &&
        rect.top < window.innerHeight
      );
    });

    const visibleAnchors = sceneRoots
      .map((sceneRoot) => {
        const sectionId =
          sceneRoot.getAttribute("data-live-dict-area-scene-section-id") ?? "";
        const blockCount = Number.parseInt(
          sceneRoot.getAttribute("data-live-dict-area-scene-block-count") ??
            "0",
          10,
        );

        return {
          blockAnchorCount: sceneRoot.querySelectorAll(
            `[data-live-dict-area-scene-block-anchor='true'][data-live-dict-area-scene-section-id='${sectionId}']`,
          ).length,
          blockCount,
          nestedUnderMatchingSection:
            sectionId.length > 0 &&
            sceneRoot.closest(`[data-section-id='${sectionId}']`) !== null,
          sectionId,
        };
      })
      .slice(0, 6);

    return visibleAnchors.length === 0 ? null : visibleAnchors;
  });

  const result = await visibleSceneAnchors.jsonValue();

  expect(result).not.toBeNull();
  expect(result?.length).toBeGreaterThan(0);
  expect(
    result?.every(
      (anchor) =>
        anchor.sectionId.length > 0 &&
        anchor.nestedUnderMatchingSection &&
        anchor.blockCount > 0 &&
        anchor.blockAnchorCount === anchor.blockCount,
    ),
  ).toBe(true);
});

test("all settings canary keeps first visible unpinned live card bodies aligned with baseline when both renderers share the same viewport transform", async ({
  browser,
}) => {
  const baselinePage = await browser.newPage();
  const canaryPage = await browser.newPage();
  let projectConfigId: string | null = null;

  try {
    await openAllSettingsBaseline(baselinePage);
    projectConfigId = await getCurrentProjectConfigId(baselinePage);

    // Normalize both surfaces independently so this parity check does not
    // inherit suite-order viewport state from earlier zoom-floor tests.
    await resetProjectWorkspaceChromeToDefaultLayout(baselinePage);
    await clearCurrentProjectViewportForRefit(baselinePage);
    await expectZoomOutButtonDisabled(baselinePage, true);

    const baselineViewport = await readViewportTransform(baselinePage);
    expect(baselineViewport.zoom).toBeGreaterThan(0);

    await expect
      .poll(async () => {
        return (
          await readVisibleBlockBounds(baselinePage, "baseline", "unpinned")
        ).length;
      })
      .toBeGreaterThanOrEqual(2);

    const baselineBlocks = (
      await readVisibleBlockBounds(baselinePage, "baseline", "unpinned")
    ).slice(0, 2);
    expect(baselineBlocks).toHaveLength(2);

    await openAllSettingsLivePixiCanary(canaryPage);
    await resetProjectWorkspaceChromeToDefaultLayout(canaryPage);
    await clearCurrentProjectViewportForRefit(canaryPage);
    await waitForVisibleSceneMetrics(canaryPage);
    await expectZoomOutButtonDisabled(canaryPage, true);
    await expectViewportTransformNear(canaryPage, baselineViewport);

    await expect
      .poll(async () => {
        const visibleCanaryBlocks = await readVisibleBlockBounds(
          canaryPage,
          "pixi",
          "unpinned",
        );
        const visibleCanaryKeys = new Set(
          visibleCanaryBlocks.map((block) => getBlockKey(block)),
        );

        return baselineBlocks.every((block) =>
          visibleCanaryKeys.has(getBlockKey(block)),
        );
      })
      .toBe(true);

    await expect
      .poll(async () => {
        const canaryBlocks = await readVisibleBlockBounds(
          canaryPage,
          "pixi",
          "unpinned",
        );
        const canaryBlocksByKey = new Map(
          canaryBlocks.map((block) => [getBlockKey(block), block]),
        );

        return baselineBlocks.reduce((maxDelta, baselineBlock) => {
          const canaryBlock = canaryBlocksByKey.get(getBlockKey(baselineBlock));
          if (!canaryBlock) {
            return Number.POSITIVE_INFINITY;
          }

          return Math.max(
            maxDelta,
            Math.abs(canaryBlock.x - baselineBlock.x),
            Math.abs(canaryBlock.y - baselineBlock.y),
            Math.abs(canaryBlock.width - baselineBlock.width),
            Math.abs(canaryBlock.height - baselineBlock.height),
          );
        }, 0);
      })
      .toBeLessThanOrEqual(2);
  } finally {
    if (projectConfigId !== null) {
      await postBackend(baselinePage, "/setViewport", {
        projectConfigId,
        viewport: null,
      });
    }
    await baselinePage.close();
    await canaryPage.close();
  }
});

test("all settings can open the read-only main reference surface when explicit runtime envs are provided", async ({
  page,
}) => {
  test.skip(
    !MAIN_REFERENCE_BASE_URL || !MAIN_REFERENCE_BOOTSTRAP_URL,
    "requires SETTA_MAIN_REFERENCE_URL and SETTA_MAIN_REFERENCE_BOOTSTRAP_URL",
  );

  await openAllSettingsMainReference(page);
  await resetProjectWorkspaceChromeToDefaultLayout(page);

  const mainViewport = await readViewportTransform(page);
  expect(mainViewport.zoom).toBeGreaterThan(0);

  await expect
    .poll(async () => {
      return (await readVisibleSectionNodeBounds(page)).length;
    })
    .toBeGreaterThanOrEqual(2);

  const mainNodes = await readVisibleSectionNodeBounds(page);
  expect(mainNodes.length).toBeGreaterThanOrEqual(2);
  expect(
    mainNodes.every((node) => node.sectionId.length > 0 && node.width > 0),
  ).toBe(true);
});

test("all settings baseline and the read-only main reference share the same normalized workspace chrome state when explicit runtime envs are provided", async ({
  browser,
}) => {
  test.skip(
    !MAIN_REFERENCE_BASE_URL || !MAIN_REFERENCE_BOOTSTRAP_URL,
    "requires SETTA_MAIN_REFERENCE_URL and SETTA_MAIN_REFERENCE_BOOTSTRAP_URL",
  );

  const baselinePage = await browser.newPage();
  const mainReferencePage = await browser.newPage();

  try {
    await openAllSettingsBaseline(baselinePage);
    await openAllSettingsMainReference(mainReferencePage);

    await expect(
      baselinePage.getByTestId("project-chat-bottom-dock-menu-trigger"),
    ).toBeVisible();
    await baselinePage
      .getByTestId("project-chat-bottom-dock-menu-trigger")
      .click();
    await expect(
      baselinePage.getByTestId("project-chat-bottom-dock-menu-content"),
    ).toBeVisible();
    await expect(
      mainReferencePage.getByTestId("project-chat-bottom-dock-menu-trigger"),
    ).toBeVisible();
    await mainReferencePage
      .getByTestId("project-chat-bottom-dock-menu-trigger")
      .click();
    await expect(
      mainReferencePage.getByTestId("project-chat-bottom-dock-menu-content"),
    ).toBeVisible();

    // Pin the exact normalization shape that future live CDP parity checks rely
    // on, without treating Playwright as a cross-runtime geometry oracle.
    await resetProjectWorkspaceChromeToDefaultLayout(baselinePage);
    await resetProjectWorkspaceChromeToDefaultLayout(mainReferencePage);

    const baselineLayout = await readProjectWorkspaceChromeLayout(baselinePage);
    const mainReferenceLayout =
      await readProjectWorkspaceChromeLayout(mainReferencePage);
    const baselineChatChrome = await readVisibleProjectChatChrome(baselinePage);
    const mainReferenceChatChrome =
      await readVisibleProjectChatChrome(mainReferencePage);

    expect(baselineLayout).toEqual(mainReferenceLayout);
    expect(baselineLayout).toEqual({
      hiddenProjectChatWindowClosed: true,
      overviewTab: "Overview",
      overviewTrueWidth: 335,
      overviewVis: true,
      overviewWidth: 335,
      uiEditorTrueWidth: 40,
      uiEditorVis: false,
      uiEditorWidth: 500,
    });
    expect(baselineChatChrome).toEqual(mainReferenceChatChrome);
    expect(baselineChatChrome).toEqual({
      bottomDockWindowCount: 0,
      floatingWindowCount: 0,
      managerMenuItemCount: 0,
      managerMenuVisible: false,
      maximizedWindowCount: 0,
      windowTitles: [],
    });
  } finally {
    await baselinePage.close();
    await mainReferencePage.close();
  }
});

test("all settings baseline and the read-only main reference resolve the same project config on their intended backends when explicit runtime envs are provided", async ({
  browser,
}) => {
  test.skip(
    !MAIN_REFERENCE_BASE_URL ||
      !MAIN_REFERENCE_BOOTSTRAP_URL ||
      !MAIN_REFERENCE_BACKEND_ORIGIN,
    "requires explicit main reference runtime envs",
  );

  const baselinePage = await browser.newPage();
  const mainReferencePage = await browser.newPage();

  try {
    await openAllSettingsBaseline(baselinePage);
    await openAllSettingsMainReference(mainReferencePage);

    await resetProjectWorkspaceChromeToDefaultLayout(baselinePage);
    await resetProjectWorkspaceChromeToDefaultLayout(mainReferencePage);

    expect(await readActiveBackendOrigin(baselinePage)).toBe(
      WORKTREE_BACKEND_ORIGIN,
    );
    expect(await readActiveBackendOrigin(mainReferencePage)).toBe(
      MAIN_REFERENCE_BACKEND_ORIGIN,
    );

    const baselineProjectConfig = await loadProjectConfig(baselinePage);
    const mainReferenceProjectConfig =
      await loadProjectConfig(mainReferencePage);

    expect(
      Object.entries(baselineProjectConfig.projectConfig.sectionVariantMap)
        .sort(([leftSectionId], [rightSectionId]) =>
          leftSectionId.localeCompare(rightSectionId),
        )
        .map(([sectionId, variantId]) => `${sectionId}:${variantId}`),
    ).toEqual(
      Object.entries(mainReferenceProjectConfig.projectConfig.sectionVariantMap)
        .sort(([leftSectionId], [rightSectionId]) =>
          leftSectionId.localeCompare(rightSectionId),
        )
        .map(([sectionId, variantId]) => `${sectionId}:${variantId}`),
    );
  } finally {
    await baselinePage.close();
    await mainReferencePage.close();
  }
});

test("all settings baseline and the read-only main reference share the same visible overview section slice when explicit runtime envs are provided", async ({
  browser,
}) => {
  test.skip(
    !MAIN_REFERENCE_BASE_URL || !MAIN_REFERENCE_BOOTSTRAP_URL,
    "requires SETTA_MAIN_REFERENCE_URL and SETTA_MAIN_REFERENCE_BOOTSTRAP_URL",
  );

  const baselinePage = await browser.newPage();
  const mainReferencePage = await browser.newPage();

  try {
    await openAllSettingsBaseline(baselinePage);
    await openAllSettingsMainReference(mainReferencePage);

    await resetProjectWorkspaceChromeToDefaultLayout(baselinePage);
    await resetProjectWorkspaceChromeToDefaultLayout(mainReferencePage);
    await normalizeAllSettingsOverviewLayout(baselinePage);
    await normalizeAllSettingsOverviewLayout(mainReferencePage);

    await expect
      .poll(async () => {
        return (await readVisibleOverviewSectionLabels(baselinePage)).length;
      })
      .toBeGreaterThanOrEqual(4);
    await expect
      .poll(async () => {
        return (await readVisibleOverviewSectionLabels(mainReferencePage))
          .length;
      })
      .toBeGreaterThanOrEqual(4);

    const baselineVisibleLabels = (
      await readVisibleOverviewSectionLabels(baselinePage)
    ).slice(0, 6);
    const mainReferenceVisibleLabels = (
      await readVisibleOverviewSectionLabels(mainReferencePage)
    ).slice(0, 6);

    expect(mainReferenceVisibleLabels).toEqual(baselineVisibleLabels);
  } finally {
    await baselinePage.close();
    await mainReferencePage.close();
  }
});

test("all settings baseline and the read-only main reference share the same visible canvas section slice when explicit runtime envs are provided", async ({
  browser,
}) => {
  test.skip(
    !MAIN_REFERENCE_BASE_URL || !MAIN_REFERENCE_BOOTSTRAP_URL,
    "requires SETTA_MAIN_REFERENCE_URL and SETTA_MAIN_REFERENCE_BOOTSTRAP_URL",
  );

  const baselinePage = await browser.newPage();
  const mainReferencePage = await browser.newPage();

  try {
    await openAllSettingsBaseline(baselinePage);
    await openAllSettingsMainReference(mainReferencePage);

    // Keep the graph-surface comparison on the canonical All Settings layout
    // instead of whichever persisted viewport/layout residue the live sessions
    // happened to carry into this run.
    await resetProjectWorkspaceChromeToDefaultLayout(baselinePage);
    await resetProjectWorkspaceChromeToDefaultLayout(mainReferencePage);
    await normalizeAllSettingsOverviewLayout(baselinePage);
    await normalizeAllSettingsOverviewLayout(mainReferencePage);
    await clearCurrentProjectViewportForRefit(baselinePage);
    await clearCurrentProjectViewportForRefit(mainReferencePage);
    await expectZoomOutButtonDisabled(baselinePage, true);
    await expectZoomOutButtonDisabled(mainReferencePage, true);

    const baselineViewport = await readViewportTransform(baselinePage);
    await expectViewportTransformNear(mainReferencePage, baselineViewport);

    await expect
      .poll(async () => {
        return (await readVisibleSectionNodeBounds(baselinePage)).length;
      })
      .toBeGreaterThanOrEqual(6);
    await expect
      .poll(async () => {
        return (await readVisibleSectionNodeBounds(mainReferencePage)).length;
      })
      .toBeGreaterThanOrEqual(6);

    const baselineNodes = (
      await readVisibleSectionNodeBounds(baselinePage)
    ).slice(0, 6);
    const mainReferenceNodes = (
      await readVisibleSectionNodeBounds(mainReferencePage)
    ).slice(0, 6);

    expect(mainReferenceNodes.map((node) => node.sectionName)).toEqual(
      baselineNodes.map((node) => node.sectionName),
    );
    expect(
      mainReferenceNodes.every((node) => node.width > 0 && node.height > 0),
    ).toBe(true);
    expect(
      baselineNodes.reduce((maxDelta, baselineNode, index) => {
        const mainNode = mainReferenceNodes[index];
        if (!mainNode) {
          return Number.POSITIVE_INFINITY;
        }

        return Math.max(
          maxDelta,
          Math.abs(mainNode.x - baselineNode.x),
          Math.abs(mainNode.y - baselineNode.y),
          Math.abs(mainNode.width - baselineNode.width),
          Math.abs(mainNode.height - baselineNode.height),
        );
      }, 0),
    ).toBeLessThanOrEqual(2);
  } finally {
    await baselinePage.close();
    await mainReferencePage.close();
  }
});

test("all settings baseline and live Pixi canary share the same visible canvas section slice after frontend viewport clear", async ({
  browser,
}) => {
  const baselinePage = await browser.newPage();
  const canaryPage = await browser.newPage();

  try {
    await openAllSettingsBaseline(baselinePage);
    await openAllSettingsLivePixiCanary(canaryPage);

    await resetProjectWorkspaceChromeToDefaultLayout(baselinePage);
    await resetProjectWorkspaceChromeToDefaultLayout(canaryPage);
    await normalizeAllSettingsOverviewLayout(baselinePage);
    await normalizeAllSettingsOverviewLayout(canaryPage);
    await clearCurrentProjectViewportForRefit(baselinePage);
    await clearCurrentProjectViewportForRefit(canaryPage);
    await waitForVisibleSceneMetrics(canaryPage);
    await expectZoomOutButtonDisabled(baselinePage, true);
    await expectZoomOutButtonDisabled(canaryPage, true);

    const baselineViewport = await readViewportTransform(baselinePage);
    await expectViewportTransformNear(canaryPage, baselineViewport);

    await expect
      .poll(async () => {
        return (await readVisibleSectionNodeBounds(baselinePage)).length;
      })
      .toBeGreaterThanOrEqual(6);
    await expect
      .poll(async () => {
        return (await readVisibleSectionNodeBounds(canaryPage)).length;
      })
      .toBeGreaterThanOrEqual(6);

    const baselineNodes = (
      await readVisibleSectionNodeBounds(baselinePage)
    ).slice(0, 6);
    const canaryNodes = (await readVisibleSectionNodeBounds(canaryPage)).slice(
      0,
      6,
    );

    expect(canaryNodes.map((node) => node.sectionName)).toEqual(
      baselineNodes.map((node) => node.sectionName),
    );
    expect(canaryNodes.every((node) => node.width > 0 && node.height > 0)).toBe(
      true,
    );
    expect(
      canaryNodes.reduce((maxDelta, canaryNode, index) => {
        const baselineNode = baselineNodes[index];
        if (!baselineNode) {
          return Number.POSITIVE_INFINITY;
        }

        return Math.max(
          maxDelta,
          Math.abs(canaryNode.x - baselineNode.x),
          Math.abs(canaryNode.y - baselineNode.y),
          Math.abs(canaryNode.width - baselineNode.width),
          Math.abs(canaryNode.height - baselineNode.height),
        );
      }, 0),
    ).toBeLessThanOrEqual(2);
  } finally {
    await baselinePage.close();
    await canaryPage.close();
  }
});

test("all settings baseline and explicit-query live Pixi canary share the same visible canvas section slice after frontend viewport clear", async ({
  browser,
}) => {
  const baselinePage = await browser.newPage();
  const canaryPage = await browser.newPage();

  try {
    await openAllSettingsBaseline(baselinePage);
    await openAllSettingsLivePixiQueryParamCanary(canaryPage);

    await resetProjectWorkspaceChromeToDefaultLayout(baselinePage);
    await resetProjectWorkspaceChromeToDefaultLayout(canaryPage);
    await normalizeAllSettingsOverviewLayout(baselinePage);
    await normalizeAllSettingsOverviewLayout(canaryPage);
    await clearCurrentProjectViewportForRefit(baselinePage);
    await clearCurrentProjectViewportForRefit(canaryPage);
    await waitForVisibleSceneMetrics(canaryPage);
    await expectZoomOutButtonDisabled(baselinePage, true);
    await expectZoomOutButtonDisabled(canaryPage, true);

    const baselineViewport = await readViewportTransform(baselinePage);
    await expectViewportTransformNear(canaryPage, baselineViewport);

    await expect
      .poll(async () => {
        return (await readVisibleSectionNodeBounds(baselinePage)).length;
      })
      .toBeGreaterThanOrEqual(6);
    await expect
      .poll(async () => {
        return (await readVisibleSectionNodeBounds(canaryPage)).length;
      })
      .toBeGreaterThanOrEqual(6);

    const baselineNodes = (
      await readVisibleSectionNodeBounds(baselinePage)
    ).slice(0, 6);
    const canaryNodes = (await readVisibleSectionNodeBounds(canaryPage)).slice(
      0,
      6,
    );

    expect(canaryNodes.map((node) => node.sectionName)).toEqual(
      baselineNodes.map((node) => node.sectionName),
    );
    expect(canaryNodes.every((node) => node.width > 0 && node.height > 0)).toBe(
      true,
    );
    expect(
      canaryNodes.reduce((maxDelta, canaryNode, index) => {
        const baselineNode = baselineNodes[index];
        if (!baselineNode) {
          return Number.POSITIVE_INFINITY;
        }

        return Math.max(
          maxDelta,
          Math.abs(canaryNode.x - baselineNode.x),
          Math.abs(canaryNode.y - baselineNode.y),
          Math.abs(canaryNode.width - baselineNode.width),
          Math.abs(canaryNode.height - baselineNode.height),
        );
      }, 0),
    ).toBeLessThanOrEqual(2);
  } finally {
    await baselinePage.close();
    await canaryPage.close();
  }
});

test("all settings baseline and live Pixi canary share the fit-view zoom-floor state after same-tab frontend viewport clear", async ({
  page,
}) => {
  await openAllSettingsBaseline(page);

  const initialViewport = await readViewportTransform(page);
  expect(initialViewport.zoom).toBeGreaterThan(0);
  const projectConfigId = await getCurrentProjectConfigId(page);

  try {
    // Neutralize any persisted viewport left by earlier tests so this check
    // covers the same-tab frontend refit path rather than suite-order residue.
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: null,
    });
    await resetProjectWorkspaceChromeToDefaultLayout(page);
    await clearCurrentProjectViewportForRefit(page);
    await expectZoomOutButtonDisabled(page, true);
    const fitViewViewport = await readViewportTransform(page);
    expect(fitViewViewport.zoom).toBeGreaterThan(0);

    await openAllSettingsLivePixiCanary(page);
    await waitForVisibleSceneMetrics(page);
    await expectZoomOutButtonDisabled(page, true);
    await expect
      .poll(async () => {
        return Math.abs(
          (await readViewportTransform(page)).zoom - fitViewViewport.zoom,
        );
      })
      .toBeLessThanOrEqual(0.0001);
  } finally {
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialViewport,
    });
  }
});

test("all settings canary completes the first fit-view pass on initial live Pixi load", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await waitForVisibleSceneMetrics(page);

  await expect
    .poll(async () => {
      return (await readFitViewInitState(page)).fitViewOnInitDone;
    })
    .toBe(true);

  await expectZoomOutButtonDisabled(page, true);
});

test("all settings explicit renderer query-param canary clears a stale saved viewport on first load", async ({
  page,
}) => {
  await openAllSettingsBaseline(page);
  const initialViewport = await readViewportTransform(page);
  const projectConfigId = await getCurrentProjectConfigId(page);

  try {
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: {
        x: 500000,
        y: 500000,
        zoom: 0.1,
      },
    });

    await openAllSettingsLivePixiQueryParamCanary(page);
    await waitForVisibleSceneMetrics(page);
    await expectZoomOutButtonDisabled(page, true);
    await expect
      .poll(async () => {
        return (await readVisibleSectionNodeBounds(page)).length;
      })
      .toBeGreaterThan(0);

    const canaryViewport = await readViewportTransform(page);
    expect(canaryViewport).not.toEqual({
      x: 500000,
      y: 500000,
      zoom: 0.1,
    });
  } finally {
    await postBackend(page, "/setViewport", {
      projectConfigId,
      viewport: initialViewport,
    });
  }
});

test("all settings baseline and live Pixi canary independently settle at the same initial zoom floor", async ({
  browser,
}) => {
  const baselinePage = await browser.newPage();
  const canaryPage = await browser.newPage();

  try {
    // Keep the routes isolated so this guard pins their true first-load state
    // instead of inheriting a same-tab viewport carry-over.
    await openAllSettingsBaseline(baselinePage);
    await expectZoomOutButtonDisabled(baselinePage, true);
    const baselineViewport = await readViewportTransform(baselinePage);
    const baselineFitViewInitState = await readFitViewInitState(baselinePage);

    await openAllSettingsLivePixiCanary(canaryPage);
    await waitForVisibleSceneMetrics(canaryPage);
    await expectZoomOutButtonDisabled(canaryPage, true);
    const canaryViewport = await readViewportTransform(canaryPage);
    const canaryFitViewInitState = await readFitViewInitState(canaryPage);

    expect(baselineFitViewInitState.fitViewOnInitDone).toBe(true);
    expect(canaryFitViewInitState.fitViewOnInitDone).toBe(true);
    expect(baselineViewport.zoom).toBeGreaterThan(0);
    expect(canaryViewport.zoom).toBeGreaterThan(0);
    expect(canaryViewport.zoom).toBeCloseTo(baselineViewport.zoom, 4);
  } finally {
    await baselinePage.close();
    await canaryPage.close();
  }
});

test("all settings canary keeps visible unpinned live card anchors stable through a zoom-in interaction", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);
  await waitForVisibleSceneMetrics(page);
  await expect
    .poll(async () => {
      return (await readFitViewInitState(page)).fitViewOnInitDone;
    })
    .toBe(true);
  await expectZoomOutButtonDisabled(page, true);

  const zoomInButton = page.getByRole("button", { name: "zoom in" });
  await expect(zoomInButton).toBeVisible();
  await expect(
    page.locator("[data-live-dict-area-scene='pixi'] canvas").first(),
  ).toBeVisible();

  await expect
    .poll(async () => {
      return (await readVisibleBlockBounds(page, "pixi", "unpinned")).length;
    })
    .toBeGreaterThanOrEqual(2);

  const initialViewport = await readViewportTransform(page);
  const initialBlocks = (await readVisibleBlockBounds(page, "pixi", "unpinned"))
    .slice(0, 4)
    .map((block) => ({
      ...block,
      key: getBlockKey(block),
    }));
  expect(initialBlocks.length).toBeGreaterThanOrEqual(2);

  await zoomInButton.click();

  await expect
    .poll(async () => (await readViewportTransform(page)).zoom, {
      message:
        "expected the live Pixi canary viewport zoom to increase after zooming in",
    })
    .toBeGreaterThan(initialViewport.zoom);

  await expect
    .poll(async () => {
      const visibleCanaryBlocks = await readVisibleBlockBounds(
        page,
        "pixi",
        "unpinned",
      );
      const visibleCanaryKeys = new Set(
        visibleCanaryBlocks.map((block) => getBlockKey(block)),
      );

      return initialBlocks.some((block) => visibleCanaryKeys.has(block.key));
    })
    .toBe(true);

  // Keep at least one of the previously visible cards on-screen and make sure
  // its anchor grows with the zoomed scene instead of disappearing or
  // shrinking during the redraw.
  await expect
    .poll(async () => {
      const canaryBlocks = await readVisibleBlockBounds(
        page,
        "pixi",
        "unpinned",
      );
      const canaryBlocksByKey = new Map(
        canaryBlocks.map((block) => [getBlockKey(block), block]),
      );
      const sharedBlocks = initialBlocks.filter((block) =>
        canaryBlocksByKey.has(block.key),
      );

      if (sharedBlocks.length === 0) {
        return false;
      }

      return sharedBlocks.every((initialBlock) => {
        const zoomedBlock = canaryBlocksByKey.get(initialBlock.key);
        if (!zoomedBlock) {
          return false;
        }

        return (
          zoomedBlock.width > initialBlock.width &&
          zoomedBlock.height > initialBlock.height
        );
      });
    })
    .toBe(true);
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
      localParamSwitchCount: overlay.querySelectorAll(
        "[data-param-switch-row-id]",
      ).length,
      overlayRowCount: overlay.querySelectorAll(
        "[data-live-dict-area-editor-overlay-row='true']",
      ).length,
      sceneCanvasCount: document.querySelectorAll(
        "[data-live-dict-area-scene='pixi'] canvas",
      ).length,
    };
  }, activatedRowId);

  const result = await overlayMetrics.jsonValue();

  expect(result).not.toBeNull();
  expect(result?.localParamContainerCount).toBe(1);
  expect(result?.localParamSwitchCount).toBe(0);
  expect(result?.overlayRowCount).toBe(1);
  expect(result?.sceneCanvasCount).toBeGreaterThan(0);
});

test("all settings canary exposes hover, focus, and press value-row state on the scene host", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const handoffButton = page
    .locator("[data-live-dict-area-editor-handoff='value-row']")
    .first();
  await handoffButton.scrollIntoViewIfNeeded();
  await expect(handoffButton).toBeVisible();

  const activatedRowId = await handoffButton.getAttribute(
    "data-live-dict-area-editor-handoff-row-id",
  );
  const sectionId = await handoffButton.evaluate((button) =>
    button.closest("[data-section-id]")?.getAttribute("data-section-id"),
  );

  expect(activatedRowId).not.toBeNull();
  expect(sectionId).not.toBeNull();

  const scene = page.locator(
    `[data-live-dict-area-scene='pixi'][data-live-dict-area-scene-section-id='${sectionId}']`,
  );

  await expect(scene).toHaveCount(1);
  await handoffButton.hover();
  await expect(scene).toHaveAttribute(
    "data-live-dict-area-scene-value-hovered-row-id",
    activatedRowId!,
  );

  await handoffButton.focus();
  await expect(scene).toHaveAttribute(
    "data-live-dict-area-scene-value-focused-row-id",
    activatedRowId!,
  );

  await handoffButton.dispatchEvent("mousedown");
  await expect(scene).toHaveAttribute(
    "data-live-dict-area-scene-value-pressed-row-id",
    activatedRowId!,
  );

  await handoffButton.dispatchEvent("mouseup");
  await expect(scene).not.toHaveAttribute(
    "data-live-dict-area-scene-value-pressed-row-id",
    activatedRowId!,
  );
});

test("all settings canary can immediately activate a CodeMirror-backed value row on first Pixi handoff click", async ({
  page,
}) => {
  await openAllSettingsLivePixiCanary(page);

  const handoffButton = page
    .locator(
      "[data-live-dict-area-editor-handoff='value-row'][data-live-dict-area-editor-handoff-editor-kind='codemirror']",
    )
    .first();
  await handoffButton.scrollIntoViewIfNeeded();
  await expect(handoffButton).toBeVisible();
  const activatedRowId = await handoffButton.getAttribute(
    "data-live-dict-area-editor-handoff-row-id",
  );
  expect(activatedRowId).not.toBeNull();
  await handoffButton.click();

  const activationMetrics = await page.waitForFunction((rowId) => {
    const overlay = document.querySelector<HTMLElement>(
      `[data-live-dict-area-editor-overlay='active'][data-live-dict-area-editor-overlay-row-id='${rowId}']`,
    );
    if (!overlay) {
      return null;
    }

    const activeElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const codeMirrorEditor = overlay.querySelector<HTMLElement>(".cm-editor");

    if (
      overlay.getAttribute("data-live-dict-area-editor-overlay-editor-kind") !==
        "codemirror" ||
      codeMirrorEditor === null ||
      !activeElement?.closest(".cm-editor")
    ) {
      return null;
    }

    return {
      activeElementInsideCodeMirror: true,
      codeMirrorHeight: codeMirrorEditor.getBoundingClientRect().height,
      editorKind: "codemirror",
      hasCodeMirrorEditor: true,
      overlayHeight: overlay.getBoundingClientRect().height,
      overlayRowSurface:
        overlay
          .querySelector("[data-live-dict-area-editor-overlay-row='true']")
          ?.getAttribute("data-live-dict-area-editor-overlay-row-surface") ??
        null,
      overlayWidth: overlay.getBoundingClientRect().width,
    };
  }, activatedRowId);

  const codemirrorActivationResult = await activationMetrics.jsonValue();

  expect(codemirrorActivationResult).not.toBeNull();
  expect(codemirrorActivationResult?.editorKind).toBe("codemirror");
  expect(codemirrorActivationResult?.hasCodeMirrorEditor).toBe(true);
  expect(codemirrorActivationResult?.activeElementInsideCodeMirror).toBe(true);
  expect(codemirrorActivationResult?.overlayRowSurface).toBe("value-only");
  expect(codemirrorActivationResult?.overlayWidth).toBeGreaterThan(120);
  expect(codemirrorActivationResult?.overlayHeight).toBeGreaterThan(16);
  expect(codemirrorActivationResult?.codeMirrorHeight).toBeGreaterThan(12);

  const performanceSnapshot = await page.waitForFunction(
    ({ names, rowId }) => {
      const getLastEntry = (name: string, type: "mark" | "measure") => {
        const entries = performance.getEntriesByName(name, type);
        return entries.length > 0 ? entries.at(-1) ?? null : null;
      };
      const readDetail = (entry: PerformanceEntry | null) => {
        if (!entry || !("detail" in entry)) {
          return null;
        }
        return entry.detail as
          | { editorKind?: string; rowId?: string }
          | null
          | undefined;
      };

      const startMark = getLastEntry(names.startMark, "mark");
      const presentedMark = getLastEntry(names.presentedMark, "mark");
      const readyMark = getLastEntry(names.readyMark, "mark");
      const overlayMeasure = getLastEntry(names.overlayMeasure, "measure");
      const presentedMeasure = getLastEntry(names.presentedMeasure, "measure");
      const presentationTailMeasure = getLastEntry(
        names.presentationTailMeasure,
        "measure",
      );
      const readyMeasure = getLastEntry(names.readyMeasure, "measure");
      const startDetail = readDetail(startMark);
      const presentedDetail = readDetail(presentedMark);
      const readyDetail = readDetail(readyMark);

      if (
        !overlayMeasure ||
        !presentedMeasure ||
        !presentationTailMeasure ||
        !readyMeasure ||
        startDetail?.rowId !== rowId ||
        presentedDetail?.rowId !== rowId ||
        readyDetail?.rowId !== rowId
      ) {
        return null;
      }

      return {
        overlayDuration: overlayMeasure.duration,
        presentationTailDuration: presentationTailMeasure.duration,
        presentedDuration: presentedMeasure.duration,
        presentedEditorKind: presentedDetail?.editorKind ?? null,
        presentedRowId: presentedDetail?.rowId ?? null,
        readyDuration: readyMeasure.duration,
        readyEditorKind: readyDetail?.editorKind ?? null,
        readyRowId: readyDetail?.rowId ?? null,
        startEditorKind: startDetail?.editorKind ?? null,
        startRowId: startDetail?.rowId ?? null,
      } satisfies ValueRowPerfSnapshot;
    },
    {
      names: {
        overlayMeasure:
          LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_OVERLAY_MEASURE_NAME,
        presentationTailMeasure:
          LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTATION_TAIL_MEASURE_NAME,
        presentedMark:
          LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MARK_NAME,
        presentedMeasure:
          LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_PRESENTED_MEASURE_NAME,
        readyMark: LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MARK_NAME,
        readyMeasure: LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_READY_MEASURE_NAME,
        startMark: LIVE_DICT_AREA_PIXI_VALUE_ROW_HANDOFF_START_MARK_NAME,
      },
      rowId: activatedRowId,
    },
  );

  const handoffPerf = await performanceSnapshot.jsonValue();

  expect(handoffPerf).not.toBeNull();
  expect(handoffPerf?.startEditorKind).toBe("codemirror");
  expect(handoffPerf?.startRowId).toBe(activatedRowId);
  expect(handoffPerf?.readyEditorKind).toBe("codemirror");
  expect(handoffPerf?.readyRowId).toBe(activatedRowId);
  expect(handoffPerf?.presentedEditorKind).toBe("codemirror");
  expect(handoffPerf?.presentedRowId).toBe(activatedRowId);
  expect(handoffPerf?.overlayDuration).toBeGreaterThanOrEqual(0);
  expect(handoffPerf?.readyDuration).toBeGreaterThanOrEqual(
    handoffPerf?.overlayDuration ?? 0,
  );
  expect(handoffPerf?.presentedDuration).toBeGreaterThanOrEqual(
    handoffPerf?.readyDuration ?? 0,
  );
  expect(handoffPerf?.presentationTailDuration).toBeGreaterThanOrEqual(0);
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

  const colorPickerHandoffButtons = page.locator(
    "[data-live-dict-area-editor-handoff='value-row'][data-live-dict-area-editor-handoff-editor-kind='color-picker']",
  );
  const visibleColorPickerHandoffLabels =
    await colorPickerHandoffButtons.evaluateAll((buttons) =>
      buttons
        .filter((button) => {
          const style = window.getComputedStyle(button);
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            button.getBoundingClientRect().height > 0
          );
        })
        .map((button) => button.getAttribute("aria-label") ?? ""),
    );

  expect(visibleColorPickerHandoffLabels.length).toBeGreaterThan(0);
  visibleColorPickerHandoffLabels.forEach((handoffAriaLabel) => {
    expect(handoffAriaLabel).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  const handoffButton = colorPickerHandoffButtons.first();
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
