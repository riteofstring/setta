export type WorkspacePaneLayout =
  | "bottom-split"
  | "columns"
  | "grid"
  | "left-split"
  | "right-split"
  | "rows"
  | "top-split";

export type WorkspacePaneSplitTarget =
  | "bottom"
  | "bottom-left"
  | "bottom-right"
  | "left"
  | "right"
  | "top"
  | "top-left"
  | "top-right";

interface WorkspacePaneLayoutState<TPane> {
  layout: WorkspacePaneLayout;
  panes: TPane[];
}

type PaneOrderToken = "new" | 0 | 1 | 2;

interface WorkspacePaneSplitPlan {
  layout: WorkspacePaneLayout;
  order: PaneOrderToken[];
}

const spanningWorkspacePaneLayouts = new Set<WorkspacePaneLayout>([
  "bottom-split",
  "left-split",
  "right-split",
  "top-split",
]);

const removalLayoutAfterGridPaneRemoval = [
  "bottom-split",
  "bottom-split",
  "top-split",
  "top-split",
] satisfies WorkspacePaneLayout[];

const removalLayoutWithTwoPanes = {
  "bottom-split": ["columns", "rows", "rows"],
  columns: ["columns", "columns"],
  grid: ["columns", "columns", "rows", "rows"],
  "left-split": ["columns", "columns", "rows"],
  "right-split": ["rows", "columns", "columns"],
  rows: ["rows", "rows"],
  "top-split": ["rows", "rows", "columns"],
} satisfies Record<WorkspacePaneLayout, WorkspacePaneLayout[]>;

const vacancyPaneOrder: Partial<Record<WorkspacePaneLayout, PaneOrderToken[]>> = {
  "bottom-split": [0, "new", 1, 2],
  "left-split": [0, 2, 1, "new"],
  "right-split": [0, 1, "new", 2],
  "top-split": [0, 1, 2, "new"],
};

const thirdPaneSplitPlanByLayout: Partial<
  Record<WorkspacePaneLayout, Record<WorkspacePaneSplitTarget, WorkspacePaneSplitPlan>>
> = {
  columns: {
    bottom: { layout: "top-split", order: [0, 1, "new"] },
    "bottom-left": { layout: "top-split", order: [0, 1, "new"] },
    "bottom-right": { layout: "top-split", order: [0, 1, "new"] },
    left: { layout: "right-split", order: ["new", 0, 1] },
    right: { layout: "left-split", order: [0, 1, "new"] },
    top: { layout: "bottom-split", order: ["new", 0, 1] },
    "top-left": { layout: "top-split", order: ["new", 1, 0] },
    "top-right": { layout: "top-split", order: [0, "new", 1] },
  },
  rows: {
    bottom: { layout: "top-split", order: [0, 1, "new"] },
    "bottom-left": { layout: "bottom-split", order: [0, "new", 1] },
    "bottom-right": { layout: "bottom-split", order: [0, 1, "new"] },
    left: { layout: "right-split", order: ["new", 0, 1] },
    right: { layout: "left-split", order: [0, 1, "new"] },
    top: { layout: "bottom-split", order: ["new", 0, 1] },
    "top-left": { layout: "top-split", order: ["new", 0, 1] },
    "top-right": { layout: "top-split", order: [0, "new", 1] },
  },
};

const thirdPaneLayoutByTarget = {
  bottom: "top-split",
  "bottom-left": "top-split",
  "bottom-right": "top-split",
  left: "right-split",
  right: "left-split",
  top: "bottom-split",
  "top-left": "grid",
  "top-right": "grid",
} satisfies Record<WorkspacePaneSplitTarget, WorkspacePaneLayout>;

const thirdPaneRowsLayoutByTarget: Partial<Record<WorkspacePaneSplitTarget, WorkspacePaneLayout>> =
  {
    "bottom-left": "grid",
    "bottom-right": "grid",
    "top-left": "bottom-split",
    "top-right": "bottom-split",
  };

const thirdPaneInsertionIndexByTarget = {
  bottom: 2,
  "bottom-left": 2,
  "bottom-right": 2,
  left: 0,
  right: 2,
  top: 0,
  "top-left": 0,
  "top-right": 1,
} satisfies Record<WorkspacePaneSplitTarget, number>;

const thirdPaneRowsInsertionIndexByTarget: Partial<Record<WorkspacePaneSplitTarget, number>> = {
  "top-right": 0,
};

const defaultSplitInsertionIndexByTarget = {
  bottom: Number.MAX_SAFE_INTEGER,
  "bottom-left": 2,
  "bottom-right": Number.MAX_SAFE_INTEGER,
  left: 0,
  right: 1,
  top: 0,
  "top-left": 0,
  "top-right": 1,
} satisfies Record<WorkspacePaneSplitTarget, number>;

const vacancyInsertionIndexByLayout: Partial<
  Record<WorkspacePaneLayout, Partial<Record<WorkspacePaneSplitTarget, number>>>
> = {
  "bottom-split": {
    right: 1,
    top: 1,
    "top-right": 1,
  },
  "left-split": {
    bottom: 3,
    "bottom-right": 3,
    right: 3,
  },
  "right-split": {
    bottom: 2,
    "bottom-left": 2,
    left: 2,
  },
  "top-split": {
    bottom: 3,
    "bottom-right": 3,
    right: 3,
  },
};

export function appendWorkspacePane<TPane>(
  layout: WorkspacePaneLayout,
  panes: TPane[],
  pane: TPane,
): WorkspacePaneLayoutState<TPane> {
  const count = panes.length + 1;
  if (count <= 1) {
    return { layout: "grid", panes: [pane] };
  }
  if (count === 2) {
    return { layout: layout === "rows" ? "rows" : "columns", panes: [...panes, pane] };
  }
  if (count === 3) {
    return { layout: layout === "rows" ? "left-split" : "top-split", panes: [...panes, pane] };
  }
  return fillWorkspacePaneVacancy(layout, panes, pane);
}

export function removeWorkspacePaneFromLayout<TPane extends { id: string }>(
  layout: WorkspacePaneLayout,
  panes: TPane[],
  paneId: string,
): WorkspacePaneLayoutState<TPane> {
  const removedIndex = panes.findIndex((pane) => pane.id === paneId);
  if (removedIndex === -1) {
    return { layout, panes };
  }
  const next = panes.filter((pane) => pane.id !== paneId);
  return {
    layout: workspacePaneLayoutAfterRemoval(layout, removedIndex, next.length),
    panes: next,
  };
}

export function workspacePaneLayoutAfterRemoval(
  current: WorkspacePaneLayout,
  removedIndex: number,
  remainingCount: number,
): WorkspacePaneLayout {
  if (remainingCount <= 1) {
    return "grid";
  }
  if (remainingCount >= 4) {
    return "grid";
  }
  if (remainingCount === 3) {
    return workspacePaneLayoutAfterRemovalToThree(current, removedIndex);
  }
  return removalLayoutWithTwoPanes[current][removedIndex] ?? "columns";
}

export function insertWorkspacePaneAtSplitTarget<TPane>(
  layout: WorkspacePaneLayout,
  panes: TPane[],
  pane: TPane,
  target: WorkspacePaneSplitTarget,
): WorkspacePaneLayoutState<TPane> {
  const count = panes.length + 1;
  const thirdPanePlan = count === 3 ? thirdPaneSplitPlanByLayout[layout]?.[target] : undefined;
  if (thirdPanePlan) {
    return {
      layout: thirdPanePlan.layout,
      panes: applyWorkspacePaneOrder(panes, pane, thirdPanePlan.order, layout),
    };
  }
  const next = [...panes];
  next.splice(workspacePaneSplitInsertionIndex(layout, target, count), 0, pane);
  return {
    layout: workspacePaneLayoutForSplitTarget(layout, target, count),
    panes: next,
  };
}

function workspacePaneLayoutAfterRemovalToThree(
  current: WorkspacePaneLayout,
  removedIndex: number,
) {
  if (current === "grid") {
    return removalLayoutAfterGridPaneRemoval[removedIndex] ?? "top-split";
  }
  if (spanningWorkspacePaneLayouts.has(current)) {
    return current;
  }
  return current === "rows" ? "left-split" : "top-split";
}

function fillWorkspacePaneVacancy<TPane>(
  layout: WorkspacePaneLayout,
  panes: TPane[],
  pane: TPane,
): WorkspacePaneLayoutState<TPane> {
  const order = vacancyPaneOrder[layout];
  if (!order) {
    return { layout: "grid", panes: [...panes, pane] };
  }
  return {
    layout: "grid",
    panes: applyWorkspacePaneOrder(panes, pane, order, layout),
  };
}

function applyWorkspacePaneOrder<TPane>(
  panes: TPane[],
  pane: TPane,
  order: PaneOrderToken[],
  layout: WorkspacePaneLayout,
) {
  return order.map((token) =>
    token === "new" ? pane : requireWorkspacePane(panes, token, layout),
  );
}

function workspacePaneLayoutForSplitTarget(
  current: WorkspacePaneLayout,
  target: WorkspacePaneSplitTarget,
  count: number,
): WorkspacePaneLayout {
  if (count <= 1 || count >= 4) {
    return "grid";
  }
  if (count === 3) {
    return workspacePaneLayoutForThirdPane(current, target);
  }
  return target === "top" || target === "bottom" ? "rows" : "columns";
}

function workspacePaneLayoutForThirdPane(
  current: WorkspacePaneLayout,
  target: WorkspacePaneSplitTarget,
) {
  return (
    (current === "rows" ? thirdPaneRowsLayoutByTarget[target] : undefined) ??
    thirdPaneLayoutByTarget[target]
  );
}

function workspacePaneSplitInsertionIndex(
  current: WorkspacePaneLayout,
  target: WorkspacePaneSplitTarget,
  count: number,
) {
  if (count === 3) {
    return workspacePaneThirdSplitInsertionIndex(current, target);
  }
  return (
    workspacePaneVacancyInsertionIndex(current, target) ??
    Math.min(defaultSplitInsertionIndexByTarget[target], count - 1)
  );
}

function workspacePaneThirdSplitInsertionIndex(
  current: WorkspacePaneLayout,
  target: WorkspacePaneSplitTarget,
) {
  return (
    (current === "rows" ? thirdPaneRowsInsertionIndexByTarget[target] : undefined) ??
    thirdPaneInsertionIndexByTarget[target]
  );
}

function workspacePaneVacancyInsertionIndex(
  current: WorkspacePaneLayout,
  target: WorkspacePaneSplitTarget,
) {
  return vacancyInsertionIndexByLayout[current]?.[target] ?? null;
}

function requireWorkspacePane<TPane>(panes: TPane[], index: number, layout: WorkspacePaneLayout) {
  const pane = panes[index];
  if (!pane) {
    throw new Error(`Missing workspace pane ${index} for ${layout} layout`);
  }
  return pane;
}
