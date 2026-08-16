import type {
  WorkspaceShellPane,
  WorkspaceShellPaneViewState,
  WorkspaceShellViewState,
} from "./workspaceShellTypes";

export const WORKSPACE_SHELL_CLOSED_PANE_WIDTH = 40;
export const WORKSPACE_OUTLINE_TAB_ID = "outline";
export const WORKSPACE_INSPECTOR_TAB_ID = "inspector";
const WORKSPACE_SHELL_INITIAL_LEADING_WIDTH = 335;
const WORKSPACE_SHELL_INITIAL_TRAILING_WIDTH = 500;

const FULL_WIDTH_EPSILON = 2;
const MINIMUM_WIDTH_BY_PANE: Record<WorkspaceShellPane, number> = {
  leading: 250,
  trailing: 425,
};

function assertTabId(tabId: string, pane: WorkspaceShellPane): void {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(tabId)) {
    throw new Error(
      `Workspace shell ${pane} tab id ${JSON.stringify(tabId)} must start with a letter and contain only letters, numbers, underscores, or hyphens.`,
    );
  }
}

export function createWorkspaceShellViewState({
  leadingTabId = WORKSPACE_OUTLINE_TAB_ID,
  trailingTabId = WORKSPACE_INSPECTOR_TAB_ID,
}: {
  leadingTabId?: string;
  trailingTabId?: string;
} = {}): WorkspaceShellViewState {
  assertTabId(leadingTabId, "leading");
  assertTabId(trailingTabId, "trailing");
  return {
    leading: {
      selectedTabId: leadingTabId,
      visible: true,
      width: WORKSPACE_SHELL_INITIAL_LEADING_WIDTH,
      rememberedNonFullWidth: WORKSPACE_SHELL_INITIAL_LEADING_WIDTH,
    },
    trailing: {
      selectedTabId: trailingTabId,
      visible: false,
      width: WORKSPACE_SHELL_INITIAL_TRAILING_WIDTH,
      rememberedNonFullWidth: WORKSPACE_SHELL_INITIAL_TRAILING_WIDTH,
    },
    outline: {
      collapsedGroupIds: [],
      focusedSectionId: null,
    },
  };
}

function cloneViewState(
  state: WorkspaceShellViewState,
): WorkspaceShellViewState {
  return {
    leading: { ...state.leading },
    trailing: { ...state.trailing },
    outline: {
      collapsedGroupIds: [...state.outline.collapsedGroupIds],
      focusedSectionId: state.outline.focusedSectionId,
    },
  };
}

function getOppositePane(pane: WorkspaceShellPane): WorkspaceShellPane {
  return pane === "leading" ? "trailing" : "leading";
}

export function getWorkspaceShellPaneMaximumWidth(shellWidth: number): number {
  if (!Number.isFinite(shellWidth) || shellWidth <= 0) {
    throw new Error(
      `Workspace shell width must be a positive finite number; received ${shellWidth}.`,
    );
  }
  return Math.max(
    WORKSPACE_SHELL_CLOSED_PANE_WIDTH,
    shellWidth - WORKSPACE_SHELL_CLOSED_PANE_WIDTH,
  );
}

export function getWorkspaceShellPaneMinimumWidth(
  pane: WorkspaceShellPane,
  shellWidth: number,
): number {
  return Math.min(
    MINIMUM_WIDTH_BY_PANE[pane],
    getWorkspaceShellPaneMaximumWidth(shellWidth),
  );
}

function clampPaneWidth(
  pane: WorkspaceShellPane,
  width: number,
  shellWidth: number,
): number {
  return Math.min(
    Math.max(width, getWorkspaceShellPaneMinimumWidth(pane, shellWidth)),
    getWorkspaceShellPaneMaximumWidth(shellWidth),
  );
}

export function isWorkspaceShellPaneFullWidth(
  width: number,
  shellWidth: number,
): boolean {
  return (
    width >= getWorkspaceShellPaneMaximumWidth(shellWidth) - FULL_WIDTH_EPSILON
  );
}

export function getWorkspaceShellPaneTrueWidth(
  pane: WorkspaceShellPaneViewState,
): number {
  return pane.visible ? pane.width : WORKSPACE_SHELL_CLOSED_PANE_WIDTH;
}

function closePane(
  state: WorkspaceShellViewState,
  pane: WorkspaceShellPane,
): void {
  state[pane].visible = false;
}

function openPaneAtWidth(
  state: WorkspaceShellViewState,
  pane: WorkspaceShellPane,
  width: number,
  shellWidth: number,
): void {
  const nextWidth = clampPaneWidth(pane, width, shellWidth);
  state[pane].visible = true;
  state[pane].width = nextWidth;
  if (!isWorkspaceShellPaneFullWidth(nextWidth, shellWidth)) {
    state[pane].rememberedNonFullWidth = nextWidth;
  }
}

function canFitBothPanes(shellWidth: number): boolean {
  return (
    getWorkspaceShellPaneMinimumWidth("leading", shellWidth) +
      getWorkspaceShellPaneMinimumWidth("trailing", shellWidth) <=
    shellWidth
  );
}

function resizePane(
  state: WorkspaceShellViewState,
  pane: WorkspaceShellPane,
  width: number,
  shellWidth: number,
): void {
  const opposite = getOppositePane(pane);
  let nextWidth = clampPaneWidth(pane, width, shellWidth);
  openPaneAtWidth(state, pane, nextWidth, shellWidth);
  if (!state[opposite].visible) {
    return;
  }
  if (!canFitBothPanes(shellWidth)) {
    closePane(state, opposite);
    return;
  }

  let oppositeWidth = clampPaneWidth(
    opposite,
    state[opposite].width,
    shellWidth,
  );
  let overflow = nextWidth + oppositeWidth - shellWidth;
  if (overflow <= 0) {
    openPaneAtWidth(state, opposite, oppositeWidth, shellWidth);
    return;
  }

  oppositeWidth = Math.max(
    getWorkspaceShellPaneMinimumWidth(opposite, shellWidth),
    oppositeWidth - overflow,
  );
  overflow = nextWidth + oppositeWidth - shellWidth;
  if (overflow > 0) {
    nextWidth = Math.max(
      getWorkspaceShellPaneMinimumWidth(pane, shellWidth),
      nextWidth - overflow,
    );
  }
  if (nextWidth + oppositeWidth > shellWidth) {
    closePane(state, opposite);
    openPaneAtWidth(state, pane, nextWidth, shellWidth);
    return;
  }
  openPaneAtWidth(state, pane, nextWidth, shellWidth);
  openPaneAtWidth(state, opposite, oppositeWidth, shellWidth);
}

function openPane(
  state: WorkspaceShellViewState,
  pane: WorkspaceShellPane,
  shellWidth: number,
): void {
  const opposite = getOppositePane(pane);
  const targetWidth = clampPaneWidth(pane, state[pane].width, shellWidth);
  if (!state[opposite].visible) {
    openPaneAtWidth(state, pane, targetWidth, shellWidth);
    return;
  }
  if (!canFitBothPanes(shellWidth)) {
    closePane(state, opposite);
    openPaneAtWidth(state, pane, targetWidth, shellWidth);
    return;
  }

  const oppositeWidth = clampPaneWidth(
    opposite,
    state[opposite].width,
    shellWidth,
  );
  if (isWorkspaceShellPaneFullWidth(oppositeWidth, shellWidth)) {
    closePane(state, opposite);
    openPaneAtWidth(state, pane, targetWidth, shellWidth);
    return;
  }
  resizePane(state, pane, targetWidth, shellWidth);
}

export function toggleWorkspaceShellPane(
  state: WorkspaceShellViewState,
  pane: WorkspaceShellPane,
  shellWidth: number,
): WorkspaceShellViewState {
  const next = cloneViewState(state);
  if (next[pane].visible) {
    closePane(next, pane);
  } else {
    openPane(next, pane, shellWidth);
  }
  return next;
}

export function selectWorkspaceShellTab(
  state: WorkspaceShellViewState,
  pane: WorkspaceShellPane,
  tabId: string,
  shellWidth: number,
): WorkspaceShellViewState {
  assertTabId(tabId, pane);
  if (state[pane].selectedTabId === tabId) {
    return toggleWorkspaceShellPane(state, pane, shellWidth);
  }
  const next = cloneViewState(state);
  next[pane].selectedTabId = tabId;
  if (!next[pane].visible) {
    openPane(next, pane, shellWidth);
  }
  return next;
}

export function resizeWorkspaceShellPane(
  state: WorkspaceShellViewState,
  pane: WorkspaceShellPane,
  width: number,
  shellWidth: number,
): WorkspaceShellViewState {
  if (!Number.isFinite(width)) {
    throw new Error(
      `Workspace shell ${pane} pane width must be finite; received ${width}.`,
    );
  }
  const next = cloneViewState(state);
  resizePane(next, pane, width, shellWidth);
  return next;
}

export function toggleWorkspaceShellPaneFullWidth(
  state: WorkspaceShellViewState,
  pane: WorkspaceShellPane,
  shellWidth: number,
): WorkspaceShellViewState {
  const next = cloneViewState(state);
  const currentWidth = clampPaneWidth(pane, next[pane].width, shellWidth);
  if (
    next[pane].visible &&
    isWorkspaceShellPaneFullWidth(currentWidth, shellWidth)
  ) {
    const minimum = getWorkspaceShellPaneMinimumWidth(pane, shellWidth);
    const candidate = clampPaneWidth(
      pane,
      next[pane].rememberedNonFullWidth,
      shellWidth,
    );
    resizePane(
      next,
      pane,
      isWorkspaceShellPaneFullWidth(candidate, shellWidth)
        ? minimum
        : candidate,
      shellWidth,
    );
    return next;
  }

  if (!isWorkspaceShellPaneFullWidth(currentWidth, shellWidth)) {
    next[pane].rememberedNonFullWidth = currentWidth;
  }
  closePane(next, getOppositePane(pane));
  openPaneAtWidth(
    next,
    pane,
    getWorkspaceShellPaneMaximumWidth(shellWidth),
    shellWidth,
  );
  return next;
}

function normalizePaneWidth(
  pane: WorkspaceShellPane,
  width: number,
  previousShellWidth: number,
  shellWidth: number,
): number {
  if (isWorkspaceShellPaneFullWidth(width, previousShellWidth)) {
    return getWorkspaceShellPaneMaximumWidth(shellWidth);
  }
  return clampPaneWidth(pane, width, shellWidth);
}

export function normalizeWorkspaceShellViewState(
  state: WorkspaceShellViewState,
  previousShellWidth: number,
  shellWidth: number,
): WorkspaceShellViewState {
  let next = cloneViewState(state);
  // Frozen main normalizes both mounted panes from the same render snapshot. Applying the leading
  // and trailing requested widths in DOM order preserves the requested pane that runs last while
  // shrinking the opposite pane by the exact overflow.
  for (const pane of ["leading", "trailing"] as const) {
    if (!state[pane].visible) {
      continue;
    }
    next = resizeWorkspaceShellPane(
      next,
      pane,
      normalizePaneWidth(
        pane,
        state[pane].width,
        previousShellWidth,
        shellWidth,
      ),
      shellWidth,
    );
  }
  return next;
}
