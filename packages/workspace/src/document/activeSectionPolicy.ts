type BaseContext = {
  activeIds: Array<string>;
};

type SectionClickContext = BaseContext & {
  interaction: "section-click";
  sectionId: string;
  isSelectingItems: boolean;
  hasSelectedItems: boolean;
  multiSelectionActive: boolean;
};

type PaneClickContext = BaseContext & {
  interaction: "pane-click";
};

type SelectionRectContext = BaseContext & {
  interaction: "selection-rect";
  selectedIds: Array<string>;
};

// The reference's input-focus intent: activating an editing control inside a section makes
// that section the single active section and raises it.
type InputFocusContext = BaseContext & {
  interaction: "input-focus";
  sectionId: string;
};

// The reference's go-to intent: moving to a section without clicking it — the keyboard walking
// the canvas — makes it the single active section and raises it.
type GoToContext = BaseContext & {
  interaction: "go-to";
  sectionId: string;
};

// The reference declares separate param-select/param-unselect contexts with an unused
// `hasSelectedParams` field; the toggle decision reads only the mode flag.
type ItemToggleContext = BaseContext & {
  interaction: "item-select" | "item-unselect";
  sectionId: string;
  isSelectingItems: boolean;
};

export type ActiveSectionPolicyContext =
  | SectionClickContext
  | PaneClickContext
  | SelectionRectContext
  | InputFocusContext
  | GoToContext
  | ItemToggleContext;

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

function resolveItemToggleChange(context: ItemToggleContext): ActiveSectionPolicyResult {
  if (!context.isSelectingItems) {
    return createPolicyResult(context.activeIds, false, "item-toggle:ignored");
  }
  return createPolicyResult(
    [context.sectionId],
    false,
    context.interaction === "item-select" ? "item-select:set-active" : "item-unselect:set-active",
  );
}

function resolveItemSelectingSectionClick(context: SectionClickContext): ActiveSectionPolicyResult {
  if (!context.hasSelectedItems) {
    return createPolicyResult(context.activeIds, true, "section-click:item-select-noop");
  }
  return createPolicyResult([context.sectionId], true, "section-click:item-select-set");
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
  if (context.isSelectingItems) {
    return resolveItemSelectingSectionClick(context);
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
      return createPolicyResult(context.selectedIds, false, "selection-rect:update");
    }
    case "input-focus": {
      return createPolicyResult([context.sectionId], true, "input-focus:set-active");
    }
    case "go-to": {
      return createPolicyResult([context.sectionId], true, "go-to:set-active");
    }
    case "item-select":
    case "item-unselect": {
      return resolveItemToggleChange(context);
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
