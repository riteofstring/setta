import _ from "lodash";
import type {
  ActiveSectionPolicyContext,
  ActiveSectionPolicyResult,
} from "../document/activeSectionPolicy";
import { resolveActiveSectionChange } from "../document/activeSectionPolicy";
import { getActiveSectionIds, setActiveSectionIds } from "../document/activeSections";
import { getHighestAncestor } from "../document/documentSelectors";
import { setZIndices } from "../document/sectionZIndices";
import { useReactFlow } from "./store";

// The reference controller also carries app-only intents (input-focus, go-to, param toggles) and
// backend-sync options; the slice-reachable intents are exactly the three policy interactions.
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

export type ActiveSectionIntent = SectionClickIntent | PaneClickIntent | SelectionRectIntent;

type ActiveSectionControllerResult = ActiveSectionPolicyResult & {
  activeIdsChanged: boolean;
};

function buildPolicyContext(
  intent: ActiveSectionIntent,
  activeIds: Array<string>,
  multiSelectionActive: boolean,
): ActiveSectionPolicyContext {
  if (intent.interaction === "section-click") {
    return {
      interaction: "section-click",
      sectionId: intent.sectionId,
      activeIds,
      multiSelectionActive,
    };
  }
  if (intent.interaction === "pane-click") {
    return {
      interaction: "pane-click",
      activeIds,
    };
  }
  return {
    interaction: "selection-rect",
    activeIds,
    selectedIds: intent.selectedIds,
  };
}

export function applyActiveSectionChange(
  intent: ActiveSectionIntent,
): ActiveSectionControllerResult {
  const activeIds = getActiveSectionIds();
  const multiSelectionActive = useReactFlow.getState().multiSelectionActive;

  const context = buildPolicyContext(intent, activeIds, multiSelectionActive);
  const decision = resolveActiveSectionChange(context);
  const activeIdsChanged = !_.isEqual(activeIds, decision.nextActiveIds);

  setActiveSectionIds(decision.nextActiveIds);

  if (decision.updateZIndex && intent.interaction === "section-click") {
    setZIndices([getHighestAncestor(intent.sectionId)]);
  }

  return { ...decision, activeIdsChanged };
}
