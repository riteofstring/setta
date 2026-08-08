type BaseContext = {
  activeIds: Array<string>;
};

type SectionClickContext = BaseContext & {
  interaction: "section-click";
  sectionId: string;
  isSelectingParams: boolean;
  hasSelectedParams: boolean;
  multiSelectionActive: boolean;
};

type PaneClickContext = BaseContext & {
  interaction: "pane-click";
};

type SelectionRectContext = BaseContext & {
  interaction: "selection-rect";
  selectedIds: Array<string>;
};

type InputFocusContext = BaseContext & {
  interaction: "input-focus";
  sectionId: string;
};

type GoToContext = BaseContext & {
  interaction: "go-to";
  sectionId: string;
};

type ParamSelectContext = BaseContext & {
  interaction: "param-select";
  sectionId: string;
  isSelectingParams: boolean;
  hasSelectedParams: boolean;
};

type ParamUnselectContext = BaseContext & {
  interaction: "param-unselect";
  sectionId: string;
  isSelectingParams: boolean;
  hasSelectedParams: boolean;
};

export type ActiveSectionPolicyContext =
  | SectionClickContext
  | PaneClickContext
  | SelectionRectContext
  | InputFocusContext
  | GoToContext
  | ParamSelectContext
  | ParamUnselectContext;

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

function addActiveId(
  activeIds: Array<string>,
  sectionId: string,
): Array<string> {
  if (activeIds.includes(sectionId)) {
    return activeIds;
  }
  return [...activeIds, sectionId];
}

function removeActiveId(
  activeIds: Array<string>,
  sectionId: string,
): Array<string> {
  if (!activeIds.includes(sectionId)) {
    return activeIds;
  }
  return activeIds.filter((id) => id !== sectionId);
}

function resolveParamToggleChange(
  context: ParamSelectContext | ParamUnselectContext,
): ActiveSectionPolicyResult {
  if (!context.isSelectingParams) {
    return createPolicyResult(context.activeIds, false, "param-toggle:ignored");
  }
  return createPolicyResult(
    [context.sectionId],
    false,
    context.interaction === "param-select"
      ? "param-select:set-active"
      : "param-unselect:set-active",
  );
}

function resolveParamSelectingSectionClick(
  context: SectionClickContext,
): ActiveSectionPolicyResult {
  if (!context.hasSelectedParams) {
    return createPolicyResult(
      context.activeIds,
      true,
      "section-click:param-select-noop",
    );
  }
  return createPolicyResult(
    [context.sectionId],
    true,
    "section-click:param-select-set",
  );
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

function resolveSectionClickChange(
  context: SectionClickContext,
): ActiveSectionPolicyResult {
  if (context.isSelectingParams) {
    return resolveParamSelectingSectionClick(context);
  }
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
      return createPolicyResult(
        context.selectedIds,
        false,
        "selection-rect:update",
      );
    }
    case "input-focus": {
      return createPolicyResult(
        [context.sectionId],
        true,
        "input-focus:set-active",
      );
    }
    case "go-to": {
      return createPolicyResult([context.sectionId], true, "go-to:set-active");
    }
    case "param-select":
    case "param-unselect": {
      return resolveParamToggleChange(context);
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
