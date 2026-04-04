import { expect, type Page } from "@playwright/test";
import { postBackend } from "../helpers";

export type SettingsGraphLocalPaneState = {
  overviewVisible: boolean;
  overviewTrueWidth: number;
  uiEditorVisible: boolean;
  uiEditorTrueWidth: number;
};

export type SettingsGraphViewportTransform = {
  x: number;
  y: number;
  zoom: number;
};

export type SettingsGraphSurfaceKind = "canary" | "legacy";

export type ProjectStateSingleConfigWithCompletedOpIds = {
  projectState: {
    parentSectionMap: Record<string, string | null | undefined>;
    projectConfig: {
      activeIds: Array<string>;
      activeViewModeId: string | null;
      topLevelSections: Record<string, { x: number; y: number }>;
      viewModes: Record<
        string,
        {
          id: string;
          name: string;
          topLevelSections: Record<string, { x: number; y: number }>;
          visibilityBySectionId: Record<string, boolean>;
          viewport: SettingsGraphViewportTransform | null;
          viewportInitialized: boolean;
        }
      >;
      viewport: SettingsGraphViewportTransform | null;
      viewportInitialized: boolean;
    };
    sections: Record<string, { name: string }>;
  };
  completedOpIds: Array<string>;
  pendingOpIds: Array<string>;
};

export type SettingsGraphSectionMetrics = {
  centerOffsetFromRootCenter: number | null;
  paneState: SettingsGraphLocalPaneState;
  rect: { x: number; y: number; width: number; height: number } | null;
  surfaceKind: SettingsGraphSurfaceKind | null;
  transform: SettingsGraphViewportTransform | null;
};

export type SharedVisibleSettingsGraphSection = {
  name: string;
  sectionId: string;
};

export const SETTINGS_GRAPH_COMPARE_PANE_STATE: SettingsGraphLocalPaneState = {
  overviewVisible: false,
  overviewTrueWidth: 420,
  uiEditorVisible: false,
  uiEditorTrueWidth: 260,
};

const CANARY_SETTINGS_GRAPH_ROOT_SELECTOR =
  '[data-testid="graph-substrate-canary"]';
const CANARY_SETTINGS_GRAPH_SECTION_SELECTOR =
  '[data-testid="graph-substrate-canary-section"]';
const CANARY_SETTINGS_GRAPH_VIEWPORT_SELECTOR =
  '[data-testid="graph-substrate-canary-viewport"]';
const LEGACY_SETTINGS_GRAPH_ROOT_SELECTOR = ".react-flow";
const LEGACY_SETTINGS_GRAPH_SECTION_SELECTOR = ".react-flow__node";
const LEGACY_SETTINGS_GRAPH_VIEWPORT_SELECTOR = ".react-flow__viewport";

export async function getLatestProjectState(
  page: Page,
  projectConfigId: string,
): Promise<ProjectStateSingleConfigWithCompletedOpIds> {
  const payload = await postBackend<ProjectStateSingleConfigWithCompletedOpIds>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  if (!payload) {
    throw new Error("Missing project state payload.");
  }
  return payload;
}

export async function applyAuthoritativeViewportFromBackend(
  page: Page,
  projectConfigId: string,
  viewport: SettingsGraphViewportTransform | null,
): Promise<ProjectStateSingleConfigWithCompletedOpIds> {
  await page.evaluate(async () => {
    const { debouncedDispatchViewportUpdate } = await import(
      "/src/state/actions/sectionInfos.ts"
    );
    debouncedDispatchViewportUpdate.cancel();
  });
  await postBackend(page, "/setViewport", {
    projectConfigId,
    viewport,
  });
  const stateUpdate = await getLatestProjectState(page, projectConfigId);
  await page.evaluate(
    async (nextState: ProjectStateSingleConfigWithCompletedOpIds) => {
      const {
        debouncedDispatchViewportUpdate,
        processProjectStateUpdateFromBackend,
      } = await import("/src/state/actions/sectionInfos.ts");
      debouncedDispatchViewportUpdate.cancel();
      processProjectStateUpdateFromBackend(nextState);
    },
    stateUpdate,
  );
  return stateUpdate;
}

export function findViewModeId(
  payload: ProjectStateSingleConfigWithCompletedOpIds,
  name: string,
): string {
  for (const viewMode of Object.values(
    payload.projectState.projectConfig.viewModes,
  )) {
    if (viewMode.name === name) {
      return viewMode.id;
    }
  }
  throw new Error(`Missing view mode ${name}`);
}

export function findSectionIdByName(
  payload: ProjectStateSingleConfigWithCompletedOpIds,
  name: string,
): string {
  for (const [sectionId, section] of Object.entries(
    payload.projectState.sections,
  )) {
    if (section.name === name) {
      return sectionId;
    }
  }
  throw new Error(`Missing section ${name}`);
}

export function findSharedVisibleSettingsGraphSection(
  payload: ProjectStateSingleConfigWithCompletedOpIds,
  viewModeNames: string[],
): SharedVisibleSettingsGraphSection {
  const viewModes = viewModeNames.map((name) => {
    const viewModeId = findViewModeId(payload, name);
    const viewMode = payload.projectState.projectConfig.viewModes[viewModeId];
    if (!viewMode) {
      throw new Error(`Missing view mode ${name}`);
    }
    return viewMode;
  });

  const sharedSections = Object.entries(payload.projectState.sections)
    .filter(([sectionId]) => !payload.projectState.parentSectionMap[sectionId])
    .filter(([sectionId]) =>
      viewModes.every(
        (viewMode) => viewMode.visibilityBySectionId[sectionId] === true,
      ),
    )
    .map(([sectionId, section]) => ({
      name: section.name,
      sectionId,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  if (sharedSections.length === 0) {
    throw new Error(
      `Missing shared visible top-level section across ${viewModeNames.join(", ")}`,
    );
  }

  return sharedSections[0];
}

export async function getLocalPaneState(
  page: Page,
): Promise<SettingsGraphLocalPaneState> {
  return page.evaluate(async () => {
    const { useLocalStorage } = await import("/src/state/definitions.ts");
    const state = useLocalStorage.getState();
    return {
      overviewVisible: state.overviewVis,
      overviewTrueWidth: state.overviewTrueWidth,
      uiEditorVisible: state.uiEditorVis,
      uiEditorTrueWidth: state.uiEditorTrueWidth,
    };
  });
}

export async function setLocalPaneState(
  page: Page,
  paneState: SettingsGraphLocalPaneState,
): Promise<void> {
  await page.evaluate(async (nextPaneState: SettingsGraphLocalPaneState) => {
    const { useLocalStorage } = await import("/src/state/definitions.ts");
    useLocalStorage.setState({
      overviewVis: nextPaneState.overviewVisible,
      overviewTrueWidth: nextPaneState.overviewTrueWidth,
      uiEditorVis: nextPaneState.uiEditorVisible,
      uiEditorTrueWidth: nextPaneState.uiEditorTrueWidth,
    });
  }, paneState);

  await expect.poll(async () => getLocalPaneState(page)).toEqual(paneState);
}

export async function normalizeSettingsGraphComparePaneState(
  page: Page,
): Promise<void> {
  await setLocalPaneState(page, SETTINGS_GRAPH_COMPARE_PANE_STATE);
  await waitForSettingsGraphComparePaneChrome(page);
}

export async function fitGraphViewportToSection(
  page: Page,
  sectionId: string,
): Promise<boolean> {
  return page.evaluate(async (targetSectionId) => {
    const { fitView } = await import("/src/forks/xyflow/core/store/utils.ts");
    return fitView({
      nodes: [{ id: targetSectionId }],
      padding: 0.1,
    });
  }, sectionId);
}

export async function getSettingsGraphSurfaceKind(
  page: Page,
): Promise<SettingsGraphSurfaceKind | null> {
  return page.evaluate(
    ({
      canaryRootSelector,
      legacyRootSelector,
    }: {
      canaryRootSelector: string;
      legacyRootSelector: string;
    }) => {
      if (document.querySelector(canaryRootSelector)) {
        return "canary";
      }
      if (document.querySelector(legacyRootSelector)) {
        return "legacy";
      }
      return null;
    },
    {
      canaryRootSelector: CANARY_SETTINGS_GRAPH_ROOT_SELECTOR,
      legacyRootSelector: LEGACY_SETTINGS_GRAPH_ROOT_SELECTOR,
    },
  );
}

export async function getSettingsGraphSectionBoundingBox(
  page: Page,
  sectionId: string,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page
    .locator(`.react-flow__node[data-id="${sectionId}"]`)
    .first()
    .boundingBox();
}

export async function getSettingsGraphSectionCenterOffsetFromRootCenter(
  page: Page,
  sectionId: string,
): Promise<number | null> {
  return page.evaluate(
    ({
      targetSectionId,
      canaryRootSelector,
      canarySectionSelector,
      legacyRootSelector,
    }: {
      targetSectionId: string;
      canaryRootSelector: string;
      canarySectionSelector: string;
      legacyRootSelector: string;
    }) => {
      const canaryRoot =
        document.querySelector<HTMLElement>(canaryRootSelector);
      const root =
        canaryRoot ?? document.querySelector<HTMLElement>(legacyRootSelector);
      const section =
        document.querySelector<HTMLElement>(
          `${canarySectionSelector}[data-section-id="${targetSectionId}"]`,
        ) ??
        document.querySelector<HTMLElement>(
          `.react-flow__node[data-id="${targetSectionId}"]`,
        );
      if (!root || !section) {
        return null;
      }
      const rootRect = root.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      return (
        sectionRect.left +
        sectionRect.width / 2 -
        (rootRect.left + rootRect.width / 2)
      );
    },
    {
      targetSectionId: sectionId,
      canaryRootSelector: CANARY_SETTINGS_GRAPH_ROOT_SELECTOR,
      canarySectionSelector: CANARY_SETTINGS_GRAPH_SECTION_SELECTOR,
      legacyRootSelector: LEGACY_SETTINGS_GRAPH_ROOT_SELECTOR,
    },
  );
}

export async function getSettingsGraphViewportTransform(
  page: Page,
): Promise<SettingsGraphViewportTransform | null> {
  return page.evaluate(
    ({
      canaryRootSelector,
      canaryViewportSelector,
      legacyRootSelector,
      legacyViewportSelector,
    }: {
      canaryRootSelector: string;
      canaryViewportSelector: string;
      legacyRootSelector: string;
      legacyViewportSelector: string;
    }) => {
      const viewportSelector = document.querySelector(canaryRootSelector)
        ? canaryViewportSelector
        : document.querySelector(legacyRootSelector)
          ? legacyViewportSelector
          : null;
      if (!viewportSelector) {
        return null;
      }
      const viewport = document.querySelector<HTMLElement>(viewportSelector);
      if (!viewport) {
        return null;
      }
      const transform = window.getComputedStyle(viewport).transform;
      if (!transform || transform === "none") {
        return { x: 0, y: 0, zoom: 1 };
      }

      const matrix = new DOMMatrixReadOnly(transform);
      return {
        x: matrix.e,
        y: matrix.f,
        zoom: matrix.a,
      };
    },
    {
      canaryRootSelector: CANARY_SETTINGS_GRAPH_ROOT_SELECTOR,
      canaryViewportSelector: CANARY_SETTINGS_GRAPH_VIEWPORT_SELECTOR,
      legacyRootSelector: LEGACY_SETTINGS_GRAPH_ROOT_SELECTOR,
      legacyViewportSelector: LEGACY_SETTINGS_GRAPH_VIEWPORT_SELECTOR,
    },
  );
}

export async function getCanarySectionCenterOffsetFromRootCenter(
  page: Page,
  sectionId: string,
): Promise<number | null> {
  return page.evaluate((targetSectionId) => {
    const root = document.querySelector<HTMLElement>(
      '[data-testid="graph-substrate-canary"]',
    );
    const section = document.querySelector<HTMLElement>(
      `[data-testid="graph-substrate-canary-section"][data-section-id="${targetSectionId}"]`,
    );
    if (!root || !section) {
      return null;
    }
    const rootRect = root.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    return (
      sectionRect.left +
      sectionRect.width / 2 -
      (rootRect.left + rootRect.width / 2)
    );
  }, sectionId);
}

export async function captureSettingsGraphSectionMetrics(
  page: Page,
  sectionId: string,
): Promise<SettingsGraphSectionMetrics> {
  const [centerOffsetFromRootCenter, paneState, rect, surfaceKind, transform] =
    await Promise.all([
      getSettingsGraphSectionCenterOffsetFromRootCenter(page, sectionId),
      getLocalPaneState(page),
      getSettingsGraphSectionBoundingBox(page, sectionId),
      getSettingsGraphSurfaceKind(page),
      getSettingsGraphViewportTransform(page),
    ]);

  return {
    centerOffsetFromRootCenter,
    paneState,
    rect,
    surfaceKind,
    transform,
  };
}

async function waitForSettingsGraphComparePaneChrome(
  page: Page,
): Promise<void> {
  await expect(page.getByTestId("overview-pane-fullscreen-button")).toHaveCount(
    0,
  );
  await expect(page.getByTestId("uiEditor-pane-fullscreen-button")).toHaveCount(
    0,
  );
}

export async function findSettingsGraphPanePoint(
  page: Page,
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(
    ({
      canaryRootSelector,
      canarySectionSelector,
      legacyRootSelector,
      legacySectionSelector,
    }: {
      canaryRootSelector: string;
      canarySectionSelector: string;
      legacyRootSelector: string;
      legacySectionSelector: string;
    }) => {
      const root =
        document.querySelector<HTMLElement>(canaryRootSelector) ??
        document.querySelector<HTMLElement>(legacyRootSelector);
      if (!root) {
        return null;
      }

      const rect = root.getBoundingClientRect();
      const margin = 24;
      const columns = 8;
      const rows = 6;

      for (let row = 0; row <= rows; row += 1) {
        for (let column = 0; column <= columns; column += 1) {
          const x =
            rect.left +
            margin +
            ((rect.width - margin * 2) * column) / Math.max(columns, 1);
          const y =
            rect.top +
            margin +
            ((rect.height - margin * 2) * row) / Math.max(rows, 1);
          const element = document.elementFromPoint(x, y);
          if (!(element instanceof Element)) {
            continue;
          }
          if (
            element.closest(canarySectionSelector) ||
            element.closest(legacySectionSelector) ||
            element.closest('[data-testid="rf__minimap"]') ||
            element.closest(".react-flow__controls")
          ) {
            continue;
          }
          if (
            element.closest(canaryRootSelector) ||
            element.closest(legacyRootSelector)
          ) {
            return { x, y };
          }
        }
      }

      return null;
    },
    {
      canaryRootSelector: CANARY_SETTINGS_GRAPH_ROOT_SELECTOR,
      canarySectionSelector: CANARY_SETTINGS_GRAPH_SECTION_SELECTOR,
      legacyRootSelector: LEGACY_SETTINGS_GRAPH_ROOT_SELECTOR,
      legacySectionSelector: LEGACY_SETTINGS_GRAPH_SECTION_SELECTOR,
    },
  );

  if (!point) {
    throw new Error(
      "Unable to find a blank pan point on the settings graph surface.",
    );
  }

  return point;
}

export async function getSettingsGraphRootRelativePoint(
  page: Page,
  point: { x: number; y: number },
): Promise<{ x: number; y: number }> {
  const rootRelativePoint = await page.evaluate(
    ({
      screenPoint,
      canaryRootSelector,
      legacyRootSelector,
    }: {
      screenPoint: { x: number; y: number };
      canaryRootSelector: string;
      legacyRootSelector: string;
    }) => {
      const root =
        document.querySelector<HTMLElement>(canaryRootSelector) ??
        document.querySelector<HTMLElement>(legacyRootSelector);
      if (!root) {
        return null;
      }
      const rect = root.getBoundingClientRect();
      return {
        x: screenPoint.x - rect.left,
        y: screenPoint.y - rect.top,
      };
    },
    {
      screenPoint: point,
      canaryRootSelector: CANARY_SETTINGS_GRAPH_ROOT_SELECTOR,
      legacyRootSelector: LEGACY_SETTINGS_GRAPH_ROOT_SELECTOR,
    },
  );

  if (!rootRelativePoint) {
    throw new Error("Unable to resolve a root-relative settings graph point.");
  }

  return rootRelativePoint;
}

export async function findSettingsGraphSectionDragPoint(
  page: Page,
  sectionId: string,
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(
    ({
      targetSectionId,
      canaryRootSelector,
      canarySectionSelector,
      legacyRootSelector,
      legacySectionSelector,
    }: {
      targetSectionId: string;
      canaryRootSelector: string;
      canarySectionSelector: string;
      legacyRootSelector: string;
      legacySectionSelector: string;
    }) => {
      const blockingSelector =
        ".nodrag,input,textarea,select,option,a,[contenteditable='true']";
      const xs = [0.2, 0.35, 0.5, 0.65, 0.8];
      const ys = [0.12, 0.2, 0.3, 0.45, 0.6];
      const usingCanary = Boolean(document.querySelector(canaryRootSelector));
      const sectionSelector = usingCanary
        ? `${canarySectionSelector}[data-section-id="${targetSectionId}"]`
        : `${legacySectionSelector}[data-id="${targetSectionId}"]`;
      const resolvedSectionSelector = usingCanary
        ? canarySectionSelector
        : legacySectionSelector;
      const section = document.querySelector<HTMLElement>(sectionSelector);
      if (!section) {
        return null;
      }

      const bounds = section.getBoundingClientRect();
      for (const yPct of ys) {
        for (const xPct of xs) {
          const x = bounds.x + bounds.width * xPct;
          const y = bounds.y + bounds.height * yPct;
          const element = document.elementFromPoint(x, y);
          if (!(element instanceof Element)) {
            continue;
          }
          if (element.closest(blockingSelector)) {
            continue;
          }
          const resolvedSection = element.closest<HTMLElement>(
            resolvedSectionSelector,
          );
          if (!resolvedSection || resolvedSection !== section) {
            continue;
          }
          return { x, y };
        }
      }
      return null;
    },
    {
      targetSectionId: sectionId,
      canaryRootSelector: CANARY_SETTINGS_GRAPH_ROOT_SELECTOR,
      canarySectionSelector: CANARY_SETTINGS_GRAPH_SECTION_SELECTOR,
      legacyRootSelector: LEGACY_SETTINGS_GRAPH_ROOT_SELECTOR,
      legacySectionSelector: LEGACY_SETTINGS_GRAPH_SECTION_SELECTOR,
    },
  );

  if (!point) {
    throw new Error(
      `Unable to find a draggable graph point for section ${sectionId}.`,
    );
  }
  return point;
}

export async function findSettingsGraphSectionWheelPanPoint(
  page: Page,
  sectionId: string,
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(
    ({
      canaryRootSelector,
      targetSectionId,
      canarySectionSelector,
      legacySectionSelector,
    }: {
      canaryRootSelector: string;
      targetSectionId: string;
      canarySectionSelector: string;
      legacySectionSelector: string;
    }) => {
      const blockingSelector = ".nowheel";
      const xs = [0.2, 0.35, 0.5, 0.65, 0.8];
      const ys = [0.12, 0.2, 0.3, 0.45, 0.6];
      const usingCanary = Boolean(document.querySelector(canaryRootSelector));
      const sectionSelector = usingCanary
        ? `${canarySectionSelector}[data-section-id="${targetSectionId}"]`
        : `${legacySectionSelector}[data-id="${targetSectionId}"]`;
      const resolvedSectionSelector = usingCanary
        ? canarySectionSelector
        : legacySectionSelector;
      const section = document.querySelector<HTMLElement>(sectionSelector);
      if (!section) {
        return null;
      }

      const bounds = section.getBoundingClientRect();
      for (const yPct of ys) {
        for (const xPct of xs) {
          const x = bounds.x + bounds.width * xPct;
          const y = bounds.y + bounds.height * yPct;
          const element = document.elementFromPoint(x, y);
          if (!(element instanceof Element)) {
            continue;
          }
          if (element.closest(blockingSelector)) {
            continue;
          }
          const resolvedSection = element.closest<HTMLElement>(
            resolvedSectionSelector,
          );
          if (!resolvedSection || resolvedSection !== section) {
            continue;
          }
          return { x, y };
        }
      }

      return null;
    },
    {
      canaryRootSelector: CANARY_SETTINGS_GRAPH_ROOT_SELECTOR,
      targetSectionId: sectionId,
      canarySectionSelector: CANARY_SETTINGS_GRAPH_SECTION_SELECTOR,
      legacySectionSelector: LEGACY_SETTINGS_GRAPH_SECTION_SELECTOR,
    },
  );

  if (!point) {
    throw new Error(
      `Unable to find a wheel-pan graph point for section ${sectionId}.`,
    );
  }

  return point;
}
