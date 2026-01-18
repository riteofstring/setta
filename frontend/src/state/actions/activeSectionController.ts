import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { useMisc, useProjectState } from "state/definitions";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import {
  ActiveSectionPolicyContext,
  ActiveSectionPolicyResult,
  resolveActiveSectionChange,
} from "./activeSectionPolicy";
import { setActiveSectionIds } from "./activeSections";
import {
  getCurrEffectiveSectionImpl,
  getHighestAncestor,
} from "./sectionInfos";
import { setZIndices } from "./sections/sectionPositions";

type SectionClickIntent = {
  interaction: "section-click";
  sectionId: string;
};

type PaneClickIntent = {
  interaction: "pane-click";
};

type SelectionRectIntent = {
  interaction: "selection-rect";
  selectedIds: Array<string>;
};

type InputFocusIntent = {
  interaction: "input-focus";
  sectionId: string;
};

type GoToIntent = {
  interaction: "go-to";
  sectionId: string;
};

type ParamToggleIntent = {
  interaction: "param-select" | "param-unselect";
  sectionId: string;
  hasSelectedParams: boolean;
};

export type ActiveSectionIntent =
  | SectionClickIntent
  | PaneClickIntent
  | SelectionRectIntent
  | InputFocusIntent
  | GoToIntent
  | ParamToggleIntent;

type ActiveSectionControllerResult = ActiveSectionPolicyResult & {
  activeIdsChanged: boolean;
};

function getHasSelectedParams(sectionId: string): boolean {
  const state = useProjectState.getState();
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  if (!isBaseSectionWithParamsImpl(impl)) {
    return false;
  }
  return impl.selectedParams.length > 0;
}

function getZIndexTargets(intent: ActiveSectionIntent): Array<string> {
  if (intent.interaction === "section-click") {
    return [getHighestAncestor(intent.sectionId)];
  }
  if (intent.interaction === "input-focus") {
    return [getHighestAncestor(intent.sectionId)];
  }
  if (intent.interaction === "go-to") {
    return [intent.sectionId];
  }
  return [];
}

function buildPolicyContext(
  intent: ActiveSectionIntent,
  activeIds: Array<string>,
  isSelectingParams: boolean,
  multiSelectionActive: boolean,
): ActiveSectionPolicyContext {
  if (intent.interaction === "section-click") {
    return {
      interaction: "section-click",
      sectionId: intent.sectionId,
      activeIds,
      isSelectingParams,
      hasSelectedParams: getHasSelectedParams(intent.sectionId),
      multiSelectionActive,
    };
  }
  if (intent.interaction === "pane-click") {
    return {
      interaction: "pane-click",
      activeIds,
    };
  }
  if (intent.interaction === "selection-rect") {
    return {
      interaction: "selection-rect",
      activeIds,
      selectedIds: intent.selectedIds,
    };
  }
  if (intent.interaction === "input-focus") {
    return {
      interaction: "input-focus",
      activeIds,
      sectionId: intent.sectionId,
    };
  }
  if (intent.interaction === "go-to") {
    return {
      interaction: "go-to",
      activeIds,
      sectionId: intent.sectionId,
    };
  }
  return {
    interaction: intent.interaction,
    activeIds,
    sectionId: intent.sectionId,
    isSelectingParams,
    hasSelectedParams: intent.hasSelectedParams,
  };
}

export function applyActiveSectionChange(
  intent: ActiveSectionIntent,
): ActiveSectionControllerResult {
  const activeIds = useProjectState.getState().projectConfig.activeIds;
  const isSelectingParams = useMisc.getState().isSelectingParams;
  const multiSelectionActive = useReactFlow.getState().multiSelectionActive;

  const context = buildPolicyContext(
    intent,
    activeIds,
    isSelectingParams,
    multiSelectionActive,
  );
  const decision = resolveActiveSectionChange(context);
  const activeIdsChanged = !_.isEqual(activeIds, decision.nextActiveIds);

  if (activeIdsChanged) {
    setActiveSectionIds(decision.nextActiveIds);
  }

  if (decision.updateZIndex) {
    const zIndexTargets = getZIndexTargets(intent);
    if (zIndexTargets.length > 0) {
      setZIndices(zIndexTargets, false);
    }
  }

  return { ...decision, activeIdsChanged };
}
