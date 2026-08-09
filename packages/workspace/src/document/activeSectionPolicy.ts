type BaseContext = {
  activeIds: Array<string>;
};

type SectionClickContext = BaseContext & {
  interaction: "section-click";
  sectionId: string;
  multiSelectionActive: boolean;
};

type PaneClickContext = BaseContext & {
  interaction: "pane-click";
};

type SelectionRectContext = BaseContext & {
  interaction: "selection-rect";
  selectedIds: Array<string>;
};

export type ActiveSectionPolicyContext =
  SectionClickContext | PaneClickContext | SelectionRectContext;

export type ActiveSectionPolicyResult = {
  nextActiveIds: Array<string>;
  updateZIndex: boolean;
  reason: string;
};

function createPolicyResult(
  nextActiveIds: Array<string>,
  updateZIndex: boolean,
  reason: string,
): ActiveSectionPolicyResult {
  return {
    nextActiveIds,
    updateZIndex,
    reason,
  };
}

function addActiveId(activeIds: Array<string>, sectionId: string): Array<string> {
  if (activeIds.includes(sectionId)) {
    return activeIds;
  }
  return [...activeIds, sectionId];
}

function removeActiveId(activeIds: Array<string>, sectionId: string): Array<string> {
  if (!activeIds.includes(sectionId)) {
    return activeIds;
  }
  return activeIds.filter((id) => id !== sectionId);
}

function resolveMultiSelectionSectionClick(
  context: SectionClickContext,
): ActiveSectionPolicyResult {
  const isActive = context.activeIds.includes(context.sectionId);
  return createPolicyResult(
    isActive
      ? removeActiveId(context.activeIds, context.sectionId)
      : addActiveId(context.activeIds, context.sectionId),
    true,
    isActive ? "section-click:multi-remove" : "section-click:multi-add",
  );
}

function resolveSectionClickChange(context: SectionClickContext): ActiveSectionPolicyResult {
  if (context.multiSelectionActive) {
    return resolveMultiSelectionSectionClick(context);
  }
  return createPolicyResult([context.sectionId], true, "section-click:single");
}

export function resolveActiveSectionChange(
  context: ActiveSectionPolicyContext,
): ActiveSectionPolicyResult {
  switch (context.interaction) {
    case "pane-click": {
      return createPolicyResult([], false, "pane-click:clear");
    }
    case "selection-rect": {
      return createPolicyResult(context.selectedIds, false, "selection-rect:update");
    }
    case "section-click": {
      return resolveSectionClickChange(context);
    }
    default: {
      const _exhaustive: never = context;
      return _exhaustive;
    }
  }
}
