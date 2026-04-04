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

export type SettingsGraphComparePreflightStatus =
  | "ok"
  | "worktree_unhealthy"
  | "reference_unhealthy";

export type SettingsGraphComparePreflightIssueCode =
  | "surface_missing"
  | "wrong_surface_kind"
  | "pane_state_mismatch"
  | "active_view_mode_mismatch"
  | "missing_target_section"
  | "fit_view_failed";

export type SettingsGraphComparePreflightIssue = {
  code: SettingsGraphComparePreflightIssueCode;
  detail: string;
};

export type SettingsGraphComparePreflightResult = {
  activeViewModeName: string | null;
  issues: Array<SettingsGraphComparePreflightIssue>;
  paneState: SettingsGraphLocalPaneState;
  status: SettingsGraphComparePreflightStatus;
  surfaceKind: SettingsGraphSurfaceKind | null;
  targetSectionId: string | null;
};

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
  titleRect: { x: number; y: number; width: number; height: number } | null;
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

export function findViewModeName(
  payload: ProjectStateSingleConfigWithCompletedOpIds,
  viewModeId: string | null,
): string | null {
  if (!viewModeId) {
    return null;
  }

  const viewMode = payload.projectState.projectConfig.viewModes[viewModeId];
  return viewMode?.name ?? null;
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

function findOptionalSectionIdByName(
  payload: ProjectStateSingleConfigWithCompletedOpIds,
  name: string,
): string | null {
  for (const [sectionId, section] of Object.entries(
    payload.projectState.sections,
  )) {
    if (section.name === name) {
      return sectionId;
    }
  }
  return null;
}

function settingsGraphPaneStatesMatch(
  left: SettingsGraphLocalPaneState,
  right: SettingsGraphLocalPaneState,
): boolean {
  return (
    left.overviewVisible === right.overviewVisible &&
    left.overviewTrueWidth === right.overviewTrueWidth &&
    left.uiEditorVisible === right.uiEditorVisible &&
    left.uiEditorTrueWidth === right.uiEditorTrueWidth
  );
}

function formatSettingsGraphPaneState(
  paneState: SettingsGraphLocalPaneState,
): string {
  return JSON.stringify(paneState);
}

// Separate unhealthy runtime/setup state from renderer drift before a parity lane acts.
export async function runSettingsGraphComparePreflight(args: {
  expectedPaneState?: SettingsGraphLocalPaneState;
  expectedSurfaceKind: SettingsGraphSurfaceKind;
  expectedViewModeName: string;
  page: Page;
  projectConfigId: string;
  requireFitView?: boolean;
  side: "reference" | "worktree";
  targetSectionId?: string;
  targetSectionName?: string;
}): Promise<SettingsGraphComparePreflightResult> {
  const [payload, paneState, surfaceKind] = await Promise.all([
    getLatestProjectState(args.page, args.projectConfigId),
    getLocalPaneState(args.page),
    getSettingsGraphSurfaceKind(args.page),
  ]);

  const issues: Array<SettingsGraphComparePreflightIssue> = [];
  const activeViewModeName = findViewModeName(
    payload,
    payload.projectState.projectConfig.activeViewModeId,
  );

  if (!surfaceKind) {
    issues.push({
      code: "surface_missing",
      detail: `${args.side} surface did not mount a legacy or canary graph root.`,
    });
  } else if (surfaceKind !== args.expectedSurfaceKind) {
    issues.push({
      code: "wrong_surface_kind",
      detail: `${args.side} surface kind ${surfaceKind} did not match expected ${args.expectedSurfaceKind}.`,
    });
  }

  const expectedPaneState =
    args.expectedPaneState ?? SETTINGS_GRAPH_COMPARE_PANE_STATE;
  if (!settingsGraphPaneStatesMatch(paneState, expectedPaneState)) {
    issues.push({
      code: "pane_state_mismatch",
      detail: `${args.side} pane state ${formatSettingsGraphPaneState(paneState)} did not match expected ${formatSettingsGraphPaneState(expectedPaneState)}.`,
    });
  }

  if (activeViewModeName !== args.expectedViewModeName) {
    issues.push({
      code: "active_view_mode_mismatch",
      detail: `${args.side} active view mode ${activeViewModeName ?? "null"} did not match expected ${args.expectedViewModeName}.`,
    });
  }

  let targetSectionId = args.targetSectionId ?? null;
  if (!targetSectionId && args.targetSectionName) {
    targetSectionId = findOptionalSectionIdByName(
      payload,
      args.targetSectionName,
    );
  }

  if (!targetSectionId || !payload.projectState.sections[targetSectionId]) {
    issues.push({
      code: "missing_target_section",
      detail:
        args.targetSectionName !== undefined
          ? `${args.side} missing target section ${args.targetSectionName}.`
          : `${args.side} missing target section id ${args.targetSectionId ?? "null"}.`,
    });
  } else if (args.requireFitView) {
    const fitApplied = await fitGraphViewportToSection(
      args.page,
      targetSectionId,
    );
    if (!fitApplied) {
      issues.push({
        code: "fit_view_failed",
        detail: `${args.side} fitGraphViewportToSection(${targetSectionId}) returned false.`,
      });
    }
  }

  return {
    activeViewModeName,
    issues,
    paneState,
    status:
      issues.length === 0
        ? "ok"
        : args.side === "reference"
          ? "reference_unhealthy"
          : "worktree_unhealthy",
    surfaceKind,
    targetSectionId,
  };
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
  await waitForSettingsGraphCompareTransientChrome(page);
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

export async function getSettingsGraphSectionTitleBoundingBox(
  page: Page,
  sectionId: string,
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  return page.evaluate((targetSectionId) => {
    const title =
      document.querySelector<HTMLElement>(
        `[data-testid="graph-substrate-canary-section"][data-section-id="${targetSectionId}"] header p`,
      ) ??
      document.querySelector<HTMLElement>(
        `.react-flow__node[data-id="${targetSectionId}"] header p`,
      );
    if (!title) {
      return null;
    }
    const rect = title.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }, sectionId);
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
  const [
    centerOffsetFromRootCenter,
    paneState,
    rect,
    surfaceKind,
    titleRect,
    transform,
  ] = await Promise.all([
    getSettingsGraphSectionCenterOffsetFromRootCenter(page, sectionId),
    getLocalPaneState(page),
    getSettingsGraphSectionBoundingBox(page, sectionId),
    getSettingsGraphSurfaceKind(page),
    getSettingsGraphSectionTitleBoundingBox(page, sectionId),
    getSettingsGraphViewportTransform(page),
  ]);

  return {
    centerOffsetFromRootCenter,
    paneState,
    rect,
    surfaceKind,
    titleRect,
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

async function waitForSettingsGraphCompareTransientChrome(
  page: Page,
): Promise<void> {
  await page.evaluate(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  });

  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        const { useProjectLoading } = await import("/src/state/definitions.ts");
        return {
          headerNotificationVisible:
            document.querySelector(".header-notification-fade") !== null,
          projectIsLoading: useProjectLoading.getState().projectIsLoading,
        };
      });
    })
    .toEqual({
      headerNotificationVisible: false,
      projectIsLoading: false,
    });
}

export async function findSettingsGraphPanePoint(
  page: Page,
  options?: {
    panDelta?: { x: number; y: number };
    sectionId?: string;
  },
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(
    ({
      canaryRootSelector,
      canarySectionSelector,
      legacyRootSelector,
      legacySectionSelector,
      panDelta,
      targetSectionId,
    }: {
      canaryRootSelector: string;
      canarySectionSelector: string;
      legacyRootSelector: string;
      legacySectionSelector: string;
      panDelta?: { x: number; y: number };
      targetSectionId?: string;
    }) => {
      const root =
        document.querySelector<HTMLElement>(canaryRootSelector) ??
        document.querySelector<HTMLElement>(legacyRootSelector);
      if (!root) {
        return null;
      }

      const usingCanary = root.matches(canaryRootSelector);
      const resolvedRootSelector = usingCanary
        ? canaryRootSelector
        : legacyRootSelector;
      const resolvedSectionSelector = usingCanary
        ? canarySectionSelector
        : legacySectionSelector;
      const resolvedSectionIdAttribute = usingCanary
        ? "data-section-id"
        : "data-id";
      const rect = root.getBoundingClientRect();
      const margin = 24;
      const columns = 8;
      const rows = 6;
      const targetSection = targetSectionId
        ? document.querySelector<HTMLElement>(
            `${resolvedSectionSelector}[${resolvedSectionIdAttribute}="${targetSectionId}"]`,
          )
        : null;
      const targetSectionRect = targetSection?.getBoundingClientRect() ?? null;
      const candidatePoints: Array<{ x: number; y: number }> = [];

      const addCandidatePoint = (x: number, y: number) => {
        candidatePoints.push({ x, y });
      };

      if (targetSectionRect) {
        for (const xOffset of [-96, -72, -48]) {
          for (const yFraction of [0.3, 0.5, 0.7]) {
            addCandidatePoint(
              targetSectionRect.left + xOffset,
              targetSectionRect.top + targetSectionRect.height * yFraction,
            );
          }
        }
        for (const yOffset of [-72, -48, 48, 72]) {
          for (const xFraction of [0.2, 0.35, 0.5]) {
            addCandidatePoint(
              targetSectionRect.left + targetSectionRect.width * xFraction,
              targetSectionRect.top + yOffset,
            );
          }
        }
      }

      const pointTargetsGraphSurface = (
        x: number,
        y: number,
        allowSectionContent: boolean,
      ) => {
        if (
          x < rect.left + margin ||
          x > rect.right - margin ||
          y < rect.top + margin ||
          y > rect.bottom - margin
        ) {
          return false;
        }

        const element = document.elementFromPoint(x, y);
        if (!(element instanceof Element)) {
          return false;
        }
        if (
          element.closest('[data-testid="rf__minimap"]') ||
          element.closest(".react-flow__controls")
        ) {
          return false;
        }
        if (
          !allowSectionContent &&
          element.closest(canarySectionSelector) &&
          element.closest(resolvedRootSelector) === root
        ) {
          return false;
        }
        if (
          !allowSectionContent &&
          element.closest(legacySectionSelector) &&
          element.closest(resolvedRootSelector) === root
        ) {
          return false;
        }

        return element.closest(resolvedRootSelector) === root;
      };

      const pointSupportsPanPath = (x: number, y: number) => {
        if (!pointTargetsGraphSurface(x, y, false)) {
          return false;
        }
        if (!panDelta) {
          return true;
        }

        const steps = 6;
        for (let step = 1; step <= steps; step += 1) {
          const progress = step / steps;
          const sampleX = x + panDelta.x * progress;
          const sampleY = y + panDelta.y * progress;
          const allowSectionContent = step < steps;
          if (
            !pointTargetsGraphSurface(sampleX, sampleY, allowSectionContent)
          ) {
            return false;
          }
        }

        return true;
      };

      for (const candidate of candidatePoints) {
        if (pointSupportsPanPath(candidate.x, candidate.y)) {
          return candidate;
        }
      }

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
          if (pointSupportsPanPath(x, y)) {
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
      panDelta: options?.panDelta,
      targetSectionId: options?.sectionId,
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

export async function clearSettingsGraphFocusedEditableTarget(
  page: Page,
): Promise<void> {
  await page.evaluate(() => {
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) {
      return;
    }
    activeElement.blur();
  });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const activeElement = document.activeElement;
        if (!(activeElement instanceof Element)) {
          return false;
        }
        return activeElement.matches(
          "input,textarea,select,[contenteditable='true']",
        );
      }),
    )
    .toBe(false);
}

export async function findSettingsGraphSectionHeaderDragPoint(
  page: Page,
  sectionId: string,
): Promise<{ x: number; y: number }> {
  const point = await page.evaluate(
    ({
      targetSectionId,
      canaryRootSelector,
      canarySectionSelector,
      legacySectionSelector,
    }: {
      targetSectionId: string;
      canaryRootSelector: string;
      canarySectionSelector: string;
      legacySectionSelector: string;
    }) => {
      const blockingSelector =
        ".nodrag,input,textarea,select,option,a,button,[role='button'],summary,[contenteditable='true']";
      const xs = [0.16, 0.24, 0.32, 0.4, 0.48];
      const ys = [0.3, 0.45, 0.6];
      const usingCanary = Boolean(document.querySelector(canaryRootSelector));
      const sectionSelector = usingCanary
        ? `${canarySectionSelector}[data-section-id="${targetSectionId}"]`
        : `${legacySectionSelector}[data-id="${targetSectionId}"]`;
      const resolvedSectionSelector = usingCanary
        ? canarySectionSelector
        : legacySectionSelector;
      const section = document.querySelector<HTMLElement>(sectionSelector);
      const header = section?.querySelector<HTMLElement>("header");
      if (!section || !header) {
        return null;
      }

      const bounds = header.getBoundingClientRect();
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
      legacySectionSelector: LEGACY_SETTINGS_GRAPH_SECTION_SELECTOR,
    },
  );

  if (!point) {
    return findSettingsGraphSectionDragPoint(page, sectionId);
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

export async function getSettingsGraphOverlapDropPlan(
  page: Page,
  sectionId: string,
): Promise<{
  overlapSectionId: string;
  delta: { x: number; y: number };
} | null> {
  return page.evaluate(
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
      const usingCanary = Boolean(document.querySelector(canaryRootSelector));
      const usingLegacy =
        !usingCanary && Boolean(document.querySelector(legacyRootSelector));
      if (!usingCanary && !usingLegacy) {
        return null;
      }

      const sectionSelector = usingCanary
        ? canarySectionSelector
        : legacySectionSelector;
      const sectionIdAttribute = usingCanary ? "data-section-id" : "data-id";
      const sections = Array.from(
        document.querySelectorAll<HTMLElement>(sectionSelector),
      );
      const sourceSection = sections.find(
        (section) =>
          section.getAttribute(sectionIdAttribute) === targetSectionId,
      );
      if (!sourceSection) {
        return null;
      }

      const sourceRect = sourceSection.getBoundingClientRect();
      let bestPlan: {
        delta: { x: number; y: number };
        distance: number;
        overlapSectionId: string;
      } | null = null;

      for (const section of sections) {
        const overlapSectionId = section.getAttribute(sectionIdAttribute);
        if (!overlapSectionId || overlapSectionId === targetSectionId) {
          continue;
        }

        const rect = section.getBoundingClientRect();
        const desiredLeft =
          rect.left + Math.min(48, Math.max(24, rect.width * 0.12));
        const desiredTop =
          rect.top + Math.min(48, Math.max(24, rect.height * 0.12));
        const delta = {
          x: desiredLeft - sourceRect.left,
          y: desiredTop - sourceRect.top,
        };
        const projectedRect = {
          bottom: sourceRect.bottom + delta.y,
          left: sourceRect.left + delta.x,
          right: sourceRect.right + delta.x,
          top: sourceRect.top + delta.y,
        };
        const overlapWidth =
          Math.min(projectedRect.right, rect.right) -
          Math.max(projectedRect.left, rect.left);
        const overlapHeight =
          Math.min(projectedRect.bottom, rect.bottom) -
          Math.max(projectedRect.top, rect.top);
        if (overlapWidth < 60 || overlapHeight < 60) {
          continue;
        }

        const distance = Math.hypot(
          rect.left + rect.width / 2 - (sourceRect.left + sourceRect.width / 2),
          rect.top + rect.height / 2 - (sourceRect.top + sourceRect.height / 2),
        );
        if (bestPlan && bestPlan.distance <= distance) {
          continue;
        }
        bestPlan = {
          delta,
          distance,
          overlapSectionId,
        };
      }

      if (!bestPlan) {
        return null;
      }

      return {
        delta: bestPlan.delta,
        overlapSectionId: bestPlan.overlapSectionId,
      };
    },
    {
      targetSectionId: sectionId,
      canaryRootSelector: CANARY_SETTINGS_GRAPH_ROOT_SELECTOR,
      canarySectionSelector: CANARY_SETTINGS_GRAPH_SECTION_SELECTOR,
      legacyRootSelector: LEGACY_SETTINGS_GRAPH_ROOT_SELECTOR,
      legacySectionSelector: LEGACY_SETTINGS_GRAPH_SECTION_SELECTOR,
    },
  );
}

export async function getSettingsGraphSectionIntersectionPoint(
  page: Page,
  firstSectionId: string,
  secondSectionId: string,
): Promise<{ x: number; y: number } | null> {
  return page.evaluate(
    ({
      sourceSectionId,
      overlapSectionId,
      canaryRootSelector,
      canarySectionSelector,
      legacyRootSelector,
      legacySectionSelector,
    }: {
      sourceSectionId: string;
      overlapSectionId: string;
      canaryRootSelector: string;
      canarySectionSelector: string;
      legacyRootSelector: string;
      legacySectionSelector: string;
    }) => {
      const usingCanary = Boolean(document.querySelector(canaryRootSelector));
      const usingLegacy =
        !usingCanary && Boolean(document.querySelector(legacyRootSelector));
      if (!usingCanary && !usingLegacy) {
        return null;
      }

      const sectionSelector = usingCanary
        ? canarySectionSelector
        : legacySectionSelector;
      const sectionIdAttribute = usingCanary ? "data-section-id" : "data-id";
      const sourceSection = document.querySelector<HTMLElement>(
        `${sectionSelector}[${sectionIdAttribute}="${sourceSectionId}"]`,
      );
      const overlapSection = document.querySelector<HTMLElement>(
        `${sectionSelector}[${sectionIdAttribute}="${overlapSectionId}"]`,
      );
      if (!sourceSection || !overlapSection) {
        return null;
      }

      const sourceRect = sourceSection.getBoundingClientRect();
      const overlapRect = overlapSection.getBoundingClientRect();
      const left = Math.max(sourceRect.left, overlapRect.left);
      const top = Math.max(sourceRect.top, overlapRect.top);
      const right = Math.min(sourceRect.right, overlapRect.right);
      const bottom = Math.min(sourceRect.bottom, overlapRect.bottom);
      if (right - left < 10 || bottom - top < 10) {
        return null;
      }

      return {
        x: left + (right - left) / 2,
        y: top + (bottom - top) / 2,
      };
    },
    {
      sourceSectionId: firstSectionId,
      overlapSectionId: secondSectionId,
      canaryRootSelector: CANARY_SETTINGS_GRAPH_ROOT_SELECTOR,
      canarySectionSelector: CANARY_SETTINGS_GRAPH_SECTION_SELECTOR,
      legacyRootSelector: LEGACY_SETTINGS_GRAPH_ROOT_SELECTOR,
      legacySectionSelector: LEGACY_SETTINGS_GRAPH_SECTION_SELECTOR,
    },
  );
}

export async function getSettingsGraphSectionRenderedZIndex(
  page: Page,
  sectionId: string,
): Promise<number | null> {
  return page.evaluate(
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
      const usingCanary = Boolean(document.querySelector(canaryRootSelector));
      const usingLegacy =
        !usingCanary && Boolean(document.querySelector(legacyRootSelector));
      if (!usingCanary && !usingLegacy) {
        return null;
      }

      const sectionSelector = usingCanary
        ? canarySectionSelector
        : legacySectionSelector;
      const sectionIdAttribute = usingCanary ? "data-section-id" : "data-id";
      const section = document.querySelector<HTMLElement>(
        `${sectionSelector}[${sectionIdAttribute}="${targetSectionId}"]`,
      );
      if (!section) {
        return null;
      }

      const rawZIndex = window.getComputedStyle(section).zIndex;
      const zIndex = Number(rawZIndex);
      return Number.isFinite(zIndex) ? zIndex : null;
    },
    {
      targetSectionId: sectionId,
      canaryRootSelector: CANARY_SETTINGS_GRAPH_ROOT_SELECTOR,
      canarySectionSelector: CANARY_SETTINGS_GRAPH_SECTION_SELECTOR,
      legacyRootSelector: LEGACY_SETTINGS_GRAPH_ROOT_SELECTOR,
      legacySectionSelector: LEGACY_SETTINGS_GRAPH_SECTION_SELECTOR,
    },
  );
}
