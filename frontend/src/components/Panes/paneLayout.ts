import { useLocalStorage } from "state/definitions";
import {
  CLOSED_PANE_WIDTH,
  PaneName,
  PaneNameEnum,
} from "utils/constants/panes";
import { clamp } from "utils/utils";

type PaneLayoutState = {
  overviewVis: boolean;
  overviewWidth: number;
  overviewTrueWidth: number;
  uiEditorVis: boolean;
  uiEditorWidth: number;
  uiEditorTrueWidth: number;
  homeWorkspacePaneVis: boolean;
  homeWorkspacePaneWidth: number;
  homeWorkspacePaneTrueWidth: number;
  homeSelectedProjectPaneVis: boolean;
  homeSelectedProjectPaneWidth: number;
  homeSelectedProjectPaneTrueWidth: number;
};

const PANE_FULL_WIDTH_EPSILON_PX = 2;
const lastNonFullPaneWidthByName: Record<PaneName, number | null> = {
  [PaneNameEnum.overview]: null,
  [PaneNameEnum.uiEditor]: null,
  [PaneNameEnum.homeWorkspace]: null,
  [PaneNameEnum.homeSelectedProject]: null,
};

const PANE_MIN_WIDTH_BY_NAME: Record<PaneName, number> = {
  [PaneNameEnum.overview]: 250,
  [PaneNameEnum.uiEditor]: 425,
  [PaneNameEnum.homeWorkspace]: 260,
  [PaneNameEnum.homeSelectedProject]: 260,
};

const OPPOSITE_PANE_BY_NAME: Record<PaneName, PaneName> = {
  [PaneNameEnum.overview]: PaneNameEnum.uiEditor,
  [PaneNameEnum.uiEditor]: PaneNameEnum.overview,
  [PaneNameEnum.homeWorkspace]: PaneNameEnum.homeSelectedProject,
  [PaneNameEnum.homeSelectedProject]: PaneNameEnum.homeWorkspace,
};

function getViewportWidth(): number {
  if (typeof window === "undefined") {
    return 1440;
  }
  return window.innerWidth;
}

function getStateSnapshot(
  state: ReturnType<typeof useLocalStorage.getState>,
): PaneLayoutState {
  return {
    overviewVis: state.overviewVis,
    overviewWidth: state.overviewWidth,
    overviewTrueWidth: state.overviewTrueWidth,
    uiEditorVis: state.uiEditorVis,
    uiEditorWidth: state.uiEditorWidth,
    uiEditorTrueWidth: state.uiEditorTrueWidth,
    homeWorkspacePaneVis: state.homeWorkspacePaneVis,
    homeWorkspacePaneWidth: state.homeWorkspacePaneWidth,
    homeWorkspacePaneTrueWidth: state.homeWorkspacePaneTrueWidth,
    homeSelectedProjectPaneVis: state.homeSelectedProjectPaneVis,
    homeSelectedProjectPaneWidth: state.homeSelectedProjectPaneWidth,
    homeSelectedProjectPaneTrueWidth: state.homeSelectedProjectPaneTrueWidth,
  };
}

function getPaneVisibility(
  state: PaneLayoutState,
  paneName: PaneName,
): boolean {
  if (paneName === PaneNameEnum.uiEditor) {
    return state.uiEditorVis;
  }
  if (paneName === PaneNameEnum.homeWorkspace) {
    return state.homeWorkspacePaneVis;
  }
  if (paneName === PaneNameEnum.homeSelectedProject) {
    return state.homeSelectedProjectPaneVis;
  }
  return state.overviewVis;
}

function setPaneVisibility(
  state: PaneLayoutState,
  paneName: PaneName,
  visible: boolean,
) {
  if (paneName === PaneNameEnum.uiEditor) {
    state.uiEditorVis = visible;
    return;
  }
  if (paneName === PaneNameEnum.homeWorkspace) {
    state.homeWorkspacePaneVis = visible;
    return;
  }
  if (paneName === PaneNameEnum.homeSelectedProject) {
    state.homeSelectedProjectPaneVis = visible;
    return;
  }
  state.overviewVis = visible;
}

function getPaneWidth(state: PaneLayoutState, paneName: PaneName): number {
  if (paneName === PaneNameEnum.uiEditor) {
    return state.uiEditorWidth;
  }
  if (paneName === PaneNameEnum.homeWorkspace) {
    return state.homeWorkspacePaneWidth;
  }
  if (paneName === PaneNameEnum.homeSelectedProject) {
    return state.homeSelectedProjectPaneWidth;
  }
  return state.overviewWidth;
}

function setPaneWidthValue(
  state: PaneLayoutState,
  paneName: PaneName,
  width: number,
) {
  if (paneName === PaneNameEnum.uiEditor) {
    state.uiEditorWidth = width;
    return;
  }
  if (paneName === PaneNameEnum.homeWorkspace) {
    state.homeWorkspacePaneWidth = width;
    return;
  }
  if (paneName === PaneNameEnum.homeSelectedProject) {
    state.homeSelectedProjectPaneWidth = width;
    return;
  }
  state.overviewWidth = width;
}

function setPaneTrueWidth(
  state: PaneLayoutState,
  paneName: PaneName,
  trueWidth: number,
) {
  if (paneName === PaneNameEnum.uiEditor) {
    state.uiEditorTrueWidth = trueWidth;
    return;
  }
  if (paneName === PaneNameEnum.homeWorkspace) {
    state.homeWorkspacePaneTrueWidth = trueWidth;
    return;
  }
  if (paneName === PaneNameEnum.homeSelectedProject) {
    state.homeSelectedProjectPaneTrueWidth = trueWidth;
    return;
  }
  state.overviewTrueWidth = trueWidth;
}

function getPaneTrueWidth(state: PaneLayoutState, paneName: PaneName): number {
  if (paneName === PaneNameEnum.uiEditor) {
    return state.uiEditorTrueWidth;
  }
  if (paneName === PaneNameEnum.homeWorkspace) {
    return state.homeWorkspacePaneTrueWidth;
  }
  if (paneName === PaneNameEnum.homeSelectedProject) {
    return state.homeSelectedProjectPaneTrueWidth;
  }
  return state.overviewTrueWidth;
}

export function getPaneTrueWidthFromLayoutState(
  state: PaneLayoutState,
  paneName: PaneName,
): number {
  return getPaneTrueWidth(state, paneName);
}

function getOppositePaneName(paneName: PaneName): PaneName {
  return OPPOSITE_PANE_BY_NAME[paneName];
}

export function getPaneMinimumWidth(paneName: PaneName): number {
  return PANE_MIN_WIDTH_BY_NAME[paneName];
}

export function getPaneMaxWidthForViewport(viewportWidth: number): number {
  return Math.max(CLOSED_PANE_WIDTH, viewportWidth - CLOSED_PANE_WIDTH);
}

function getPaneMinWidthForViewport(
  paneName: PaneName,
  viewportWidth: number,
): number {
  return Math.min(
    PANE_MIN_WIDTH_BY_NAME[paneName],
    getPaneMaxWidthForViewport(viewportWidth),
  );
}

function clampPaneWidth(
  paneName: PaneName,
  width: number,
  viewportWidth: number,
): number {
  return clamp(
    width,
    getPaneMinWidthForViewport(paneName, viewportWidth),
    getPaneMaxWidthForViewport(viewportWidth),
  );
}

function isPaneFullWidth(width: number, viewportWidth: number): boolean {
  return (
    width >=
    getPaneMaxWidthForViewport(viewportWidth) - PANE_FULL_WIDTH_EPSILON_PX
  );
}

export function normalizePaneWidthForViewportChange({
  paneName,
  width,
  viewportWidth,
  previousViewportWidth,
}: {
  paneName: PaneName;
  width: number;
  viewportWidth: number;
  previousViewportWidth: number;
}): number {
  // Preserve explicit full-width intent across viewport changes.
  if (isPaneFullWidth(width, previousViewportWidth)) {
    return getPaneMaxWidthForViewport(viewportWidth);
  }
  return clampPaneWidth(paneName, width, viewportWidth);
}

function canFitBothOpen(paneName: PaneName, viewportWidth: number): boolean {
  const oppositePaneName = getOppositePaneName(paneName);
  return (
    getPaneMinWidthForViewport(paneName, viewportWidth) +
      getPaneMinWidthForViewport(oppositePaneName, viewportWidth) <=
    viewportWidth
  );
}

function closePane(state: PaneLayoutState, paneName: PaneName) {
  setPaneVisibility(state, paneName, false);
  setPaneTrueWidth(state, paneName, CLOSED_PANE_WIDTH);
}

function openPaneAtWidth(
  state: PaneLayoutState,
  paneName: PaneName,
  width: number,
  viewportWidth: number,
) {
  const clampedWidth = clampPaneWidth(paneName, width, viewportWidth);
  if (!isPaneFullWidth(clampedWidth, viewportWidth)) {
    lastNonFullPaneWidthByName[paneName] = clampedWidth;
  }
  setPaneVisibility(state, paneName, true);
  setPaneWidthValue(state, paneName, clampedWidth);
  setPaneTrueWidth(state, paneName, clampedWidth);
}

function openPaneWithLayout(
  state: PaneLayoutState,
  paneName: PaneName,
  viewportWidth: number,
) {
  const oppositePaneName = getOppositePaneName(paneName);
  const targetWidth = clampPaneWidth(
    paneName,
    getPaneWidth(state, paneName),
    viewportWidth,
  );
  const oppositeVisible = getPaneVisibility(state, oppositePaneName);
  if (!oppositeVisible) {
    openPaneAtWidth(state, paneName, targetWidth, viewportWidth);
    return;
  }

  if (!canFitBothOpen(paneName, viewportWidth)) {
    closePane(state, oppositePaneName);
    openPaneAtWidth(state, paneName, targetWidth, viewportWidth);
    return;
  }

  let nextPaneWidth = targetWidth;
  let oppositeWidth = clampPaneWidth(
    oppositePaneName,
    getPaneWidth(state, oppositePaneName),
    viewportWidth,
  );

  if (isPaneFullWidth(oppositeWidth, viewportWidth)) {
    closePane(state, oppositePaneName);
    openPaneAtWidth(state, paneName, nextPaneWidth, viewportWidth);
    return;
  }

  let overflow = nextPaneWidth + oppositeWidth - viewportWidth;
  if (overflow > 0) {
    oppositeWidth = Math.max(
      getPaneMinWidthForViewport(oppositePaneName, viewportWidth),
      oppositeWidth - overflow,
    );
    overflow = nextPaneWidth + oppositeWidth - viewportWidth;
    if (overflow > 0) {
      nextPaneWidth = Math.max(
        getPaneMinWidthForViewport(paneName, viewportWidth),
        nextPaneWidth - overflow,
      );
    }
  }

  if (nextPaneWidth + oppositeWidth > viewportWidth) {
    closePane(state, oppositePaneName);
    openPaneAtWidth(state, paneName, nextPaneWidth, viewportWidth);
    return;
  }

  openPaneAtWidth(state, oppositePaneName, oppositeWidth, viewportWidth);
  openPaneAtWidth(state, paneName, nextPaneWidth, viewportWidth);
}

function resizePaneWithLayout(
  state: PaneLayoutState,
  paneName: PaneName,
  width: number,
  viewportWidth: number,
) {
  const oppositePaneName = getOppositePaneName(paneName);
  let nextPaneWidth = clampPaneWidth(paneName, width, viewportWidth);
  openPaneAtWidth(state, paneName, nextPaneWidth, viewportWidth);
  if (!getPaneVisibility(state, oppositePaneName)) {
    return;
  }
  if (!canFitBothOpen(paneName, viewportWidth)) {
    closePane(state, oppositePaneName);
    return;
  }

  let oppositeWidth = clampPaneWidth(
    oppositePaneName,
    getPaneWidth(state, oppositePaneName),
    viewportWidth,
  );
  let overflow = nextPaneWidth + oppositeWidth - viewportWidth;
  if (overflow <= 0) {
    openPaneAtWidth(state, oppositePaneName, oppositeWidth, viewportWidth);
    return;
  }

  oppositeWidth = Math.max(
    getPaneMinWidthForViewport(oppositePaneName, viewportWidth),
    oppositeWidth - overflow,
  );
  overflow = nextPaneWidth + oppositeWidth - viewportWidth;
  if (overflow > 0) {
    nextPaneWidth = Math.max(
      getPaneMinWidthForViewport(paneName, viewportWidth),
      nextPaneWidth - overflow,
    );
  }

  if (nextPaneWidth + oppositeWidth > viewportWidth) {
    if (isPaneFullWidth(nextPaneWidth, viewportWidth)) {
      closePane(state, oppositePaneName);
      openPaneAtWidth(state, paneName, nextPaneWidth, viewportWidth);
      return;
    }
    closePane(state, oppositePaneName);
    openPaneAtWidth(state, paneName, nextPaneWidth, viewportWidth);
    return;
  }

  openPaneAtWidth(state, paneName, nextPaneWidth, viewportWidth);
  openPaneAtWidth(state, oppositePaneName, oppositeWidth, viewportWidth);
}

function togglePaneVisibilityWithLayout(
  state: PaneLayoutState,
  paneName: PaneName,
  viewportWidth: number,
) {
  if (getPaneVisibility(state, paneName)) {
    closePane(state, paneName);
    return;
  }
  openPaneWithLayout(state, paneName, viewportWidth);
}

function setPaneToFullWidth(
  state: PaneLayoutState,
  paneName: PaneName,
  viewportWidth: number,
) {
  const currentWidth = clampPaneWidth(
    paneName,
    getPaneWidth(state, paneName),
    viewportWidth,
  );
  if (!isPaneFullWidth(currentWidth, viewportWidth)) {
    lastNonFullPaneWidthByName[paneName] = currentWidth;
  }
  const oppositePaneName = getOppositePaneName(paneName);
  closePane(state, oppositePaneName);
  openPaneAtWidth(
    state,
    paneName,
    getPaneMaxWidthForViewport(viewportWidth),
    viewportWidth,
  );
}

function restorePaneFromFullWidth(
  state: PaneLayoutState,
  paneName: PaneName,
  viewportWidth: number,
) {
  const rememberedWidth = lastNonFullPaneWidthByName[paneName];
  const fallbackWidth = getPaneMinWidthForViewport(paneName, viewportWidth);
  const candidateWidth = clampPaneWidth(
    paneName,
    rememberedWidth ?? fallbackWidth,
    viewportWidth,
  );
  const nextWidth = isPaneFullWidth(candidateWidth, viewportWidth)
    ? fallbackWidth
    : candidateWidth;
  resizePaneWithLayout(state, paneName, nextWidth, viewportWidth);
}

function togglePaneFullWidthWithLayout(
  state: PaneLayoutState,
  paneName: PaneName,
  viewportWidth: number,
) {
  const paneVisible = getPaneVisibility(state, paneName);
  const currentWidth = clampPaneWidth(
    paneName,
    getPaneWidth(state, paneName),
    viewportWidth,
  );
  if (paneVisible && isPaneFullWidth(currentWidth, viewportWidth)) {
    restorePaneFromFullWidth(state, paneName, viewportWidth);
    return;
  }
  setPaneToFullWidth(state, paneName, viewportWidth);
}

function applyAndSetState(
  updater: (state: PaneLayoutState, viewportWidth: number) => void,
): { previous: PaneLayoutState; next: PaneLayoutState } {
  const viewportWidth = getViewportWidth();
  const previous = getStateSnapshot(useLocalStorage.getState());
  const next: PaneLayoutState = { ...previous };
  updater(next, viewportWidth);
  useLocalStorage.setState(next);
  return { previous, next };
}

export function togglePaneVisibility(paneName: PaneName): {
  previous: PaneLayoutState;
  next: PaneLayoutState;
} {
  return applyAndSetState((state, viewportWidth) => {
    togglePaneVisibilityWithLayout(state, paneName, viewportWidth);
  });
}

export function setPaneWidthWithLayout(
  paneName: PaneName,
  width: number,
): { previous: PaneLayoutState; next: PaneLayoutState } {
  return applyAndSetState((state, viewportWidth) => {
    resizePaneWithLayout(state, paneName, width, viewportWidth);
  });
}

export function setPaneFullWidth(paneName: PaneName): {
  previous: PaneLayoutState;
  next: PaneLayoutState;
} {
  return applyAndSetState((state, viewportWidth) => {
    setPaneToFullWidth(state, paneName, viewportWidth);
  });
}

export function togglePaneFullWidth(paneName: PaneName): {
  previous: PaneLayoutState;
  next: PaneLayoutState;
} {
  return applyAndSetState((state, viewportWidth) => {
    togglePaneFullWidthWithLayout(state, paneName, viewportWidth);
  });
}

export function resetPaneLayoutTransientStateForTests() {
  lastNonFullPaneWidthByName[PaneNameEnum.overview] = null;
  lastNonFullPaneWidthByName[PaneNameEnum.uiEditor] = null;
  lastNonFullPaneWidthByName[PaneNameEnum.homeWorkspace] = null;
  lastNonFullPaneWidthByName[PaneNameEnum.homeSelectedProject] = null;
}
