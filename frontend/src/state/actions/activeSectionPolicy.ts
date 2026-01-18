export type ActiveSectionInteraction =
  | "section-click"
  | "pane-click"
  | "selection-rect"
  | "input-focus"
  | "go-to"
  | "param-select"
  | "param-unselect";

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

export function resolveActiveSectionChange(
  context: ActiveSectionPolicyContext,
): ActiveSectionPolicyResult {
  switch (context.interaction) {
    case "pane-click": {
      return {
        nextActiveIds: [],
        updateZIndex: false,
        reason: "pane-click:clear",
      };
    }
    case "selection-rect": {
      return {
        nextActiveIds: context.selectedIds,
        updateZIndex: false,
        reason: "selection-rect:update",
      };
    }
    case "input-focus": {
      return {
        nextActiveIds: [context.sectionId],
        updateZIndex: true,
        reason: "input-focus:set-active",
      };
    }
    case "go-to": {
      return {
        nextActiveIds: [context.sectionId],
        updateZIndex: true,
        reason: "go-to:set-active",
      };
    }
    case "param-select":
    case "param-unselect": {
      if (!context.isSelectingParams) {
        return {
          nextActiveIds: context.activeIds,
          updateZIndex: false,
          reason: "param-toggle:ignored",
        };
      }
      return {
        nextActiveIds: addActiveId(context.activeIds, context.sectionId),
        updateZIndex: false,
        reason:
          context.interaction === "param-select"
            ? "param-select:activate-section"
            : "param-unselect:keep-active",
      };
    }
    case "section-click": {
      if (context.isSelectingParams) {
        if (context.hasSelectedParams) {
          return {
            nextActiveIds: addActiveId(context.activeIds, context.sectionId),
            updateZIndex: true,
            reason: "section-click:param-select-add",
          };
        }
        return {
          nextActiveIds: context.activeIds,
          updateZIndex: true,
          reason: "section-click:param-select-noop",
        };
      }
      if (context.multiSelectionActive) {
        const isActive = context.activeIds.includes(context.sectionId);
        return {
          nextActiveIds: isActive
            ? removeActiveId(context.activeIds, context.sectionId)
            : addActiveId(context.activeIds, context.sectionId),
          updateZIndex: true,
          reason: isActive
            ? "section-click:multi-remove"
            : "section-click:multi-add",
        };
      }
      return {
        nextActiveIds: [context.sectionId],
        updateZIndex: true,
        reason: "section-click:single",
      };
    }
    default: {
      const _exhaustive: never = context;
      return _exhaustive;
    }
  }
}
