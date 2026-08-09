import _ from "lodash";
import type {
  ActiveSectionPolicyContext,
  ActiveSectionPolicyResult,
} from "../document/activeSectionPolicy";
import { resolveActiveSectionChange } from "../document/activeSectionPolicy";
import { getActiveSectionIds, setActiveSectionIds } from "../document/activeSections";
import { getHighestAncestor, getSectionHasSelectedItems } from "../document/documentSelectors";
import { useItemSelectionMode } from "../document/itemSelectionMode";
import { setZIndices } from "../document/sectionZIndices";
import { useWorkspaceDocument } from "../document/stores";
import { useReactFlow } from "./store";

// The reference controller also carries app-only intents (input-focus, go-to) and backend-sync
// options. Its param-toggle intents carry a `hasSelectedParams` the policy never reads; the
// package item toggles drop it.
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

type ItemToggleIntent = {
  interaction: "item-select" | "item-unselect";
  sectionId: string;
};

export type ActiveSectionIntent =
  SectionClickIntent | PaneClickIntent | SelectionRectIntent | ItemToggleIntent;

type ActiveSectionControllerResult = ActiveSectionPolicyResult & {
  activeIdsChanged: boolean;
};

function buildPolicyContext(
  intent: ActiveSectionIntent,
  activeIds: Array<string>,
  isSelectingItems: boolean,
  multiSelectionActive: boolean,
): ActiveSectionPolicyContext {
  if (intent.interaction === "section-click") {
    return {
      interaction: "section-click",
      sectionId: intent.sectionId,
      activeIds,
      isSelectingItems,
      hasSelectedItems: getSectionHasSelectedItems(
        useWorkspaceDocument.getState(),
        intent.sectionId,
      ),
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
  return {
    interaction: intent.interaction,
    activeIds,
    sectionId: intent.sectionId,
    isSelectingItems,
  };
}

export function applyActiveSectionChange(
  intent: ActiveSectionIntent,
): ActiveSectionControllerResult {
  const activeIds = getActiveSectionIds();
  const isSelectingItems = useItemSelectionMode.getState().isSelectingItems;
  const multiSelectionActive = useReactFlow.getState().multiSelectionActive;

  const context = buildPolicyContext(intent, activeIds, isSelectingItems, multiSelectionActive);
  const decision = resolveActiveSectionChange(context);
  const activeIdsChanged = !_.isEqual(activeIds, decision.nextActiveIds);

  setActiveSectionIds(decision.nextActiveIds);

  if (decision.updateZIndex && intent.interaction === "section-click") {
    setZIndices([getHighestAncestor(intent.sectionId)]);
  }

  return { ...decision, activeIdsChanged };
}
