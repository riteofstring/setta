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
