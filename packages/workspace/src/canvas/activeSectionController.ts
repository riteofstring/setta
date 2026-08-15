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

// The reference controller also carries backend-sync options. Its param-toggle intents carry a
// `hasSelectedParams` the policy never reads; the package item toggles drop it.
type SectionClickIntent = {
  interaction: "section-click";
  sectionId: string;
  // Pointer surfaces outside the canvas receive modifier state from their own event. Omitting
  // this keeps canvas section clicks bound to the live interaction store.
  multiSelectionActive?: boolean;
};

// The reference's input-focus intent, package-owned since the built-in controls arrived:
// activating an editing control activates and raises its section.
type InputFocusIntent = {
  interaction: "input-focus";
  sectionId: string;
};

// The reference's go-to intent, which its Overview and its keyboard section navigation share:
// the target becomes the single active section and is raised, without a pointer on it.
type GoToIntent = {
  interaction: "go-to";
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
  | SectionClickIntent
  | InputFocusIntent
  | GoToIntent
  | PaneClickIntent
  | SelectionRectIntent
  | ItemToggleIntent;

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
  const multiSelectionActive =
    intent.interaction === "section-click" && intent.multiSelectionActive !== undefined
      ? intent.multiSelectionActive
      : useReactFlow.getState().multiSelectionActive;

  const context = buildPolicyContext(intent, activeIds, isSelectingItems, multiSelectionActive);
  const decision = resolveActiveSectionChange(context);
  const activeIdsChanged = !_.isEqual(activeIds, decision.nextActiveIds);

  setActiveSectionIds(decision.nextActiveIds);

  if (decision.updateZIndex) {
    // A go-to targets a top-level section directly; a click or an input focus can land deep
    // inside one, so the reference raises the whole stack those two belong to.
    if (intent.interaction === "go-to") {
      setZIndices([intent.sectionId]);
    } else if (intent.interaction === "section-click" || intent.interaction === "input-focus") {
      setZIndices([getHighestAncestor(intent.sectionId)]);
    }
  }

  return { ...decision, activeIdsChanged };
}
