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
  transform: SettingsGraphViewportTransform | null;
};

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
  const [centerOffsetFromRootCenter, paneState, rect, transform] =
    await Promise.all([
      getCanarySectionCenterOffsetFromRootCenter(page, sectionId),
      getLocalPaneState(page),
      page
        .locator(
          `[data-testid="graph-substrate-canary-section"][data-section-id="${sectionId}"]`,
        )
        .first()
        .boundingBox(),
      page.evaluate(() => {
        const viewport = document.querySelector<HTMLElement>(
          '[data-testid="graph-substrate-canary-viewport"]',
        );
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
      }),
    ]);

  return {
    centerOffsetFromRootCenter,
    paneState,
    rect,
    transform,
  };
}
