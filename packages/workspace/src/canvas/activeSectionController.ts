import _ from "lodash";
import type {
  ActiveSectionPolicyContext,
  ActiveSectionPolicyResult,
} from "../document/activeSectionPolicy";
import { resolveActiveSectionChange } from "../document/activeSectionPolicy";
import {
  getActiveSectionIds,
  setActiveSectionIds,
} from "../document/activeSections";
import {
  getHighestAncestor,
  getSectionHasSelectedItems,
} from "../document/documentSelectors";
import { getItemSelectionModeStore } from "../document/itemSelectionMode";
import { setZIndices } from "../document/sectionZIndices";
import { getWorkspaceDocumentStore } from "../document/stores";
import type { WorkspaceHost } from "../workspaceHost";
import { getReactFlowStore } from "./store";

type SectionClickIntent = {
  interaction: "section-click";
  sectionId: string;

  multiSelectionActive?: boolean;
};

type InputFocusIntent = {
  interaction: "input-focus";
  sectionId: string;
};

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

type ActiveSectionIntent =
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
  host: WorkspaceHost,
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
        getWorkspaceDocumentStore(host).getState(),
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
  host: WorkspaceHost,
  intent: ActiveSectionIntent,
): ActiveSectionControllerResult {
  const activeIds = getActiveSectionIds(host);
  const isSelectingItems =
    getItemSelectionModeStore(host).getState().isSelectingItems;
  const multiSelectionActive =
    intent.interaction === "section-click" &&
    intent.multiSelectionActive !== undefined
      ? intent.multiSelectionActive
      : getReactFlowStore(host).getState().multiSelectionActive;

  const context = buildPolicyContext(
    host,
    intent,
    activeIds,
    isSelectingItems,
    multiSelectionActive,
  );
  const decision = resolveActiveSectionChange(context);
  const activeIdsChanged = !_.isEqual(activeIds, decision.nextActiveIds);

  setActiveSectionIds(host, decision.nextActiveIds);

  if (decision.updateZIndex) {
    if (intent.interaction === "go-to") {
      setZIndices(host, [intent.sectionId]);
    } else if (
      intent.interaction === "section-click" ||
      intent.interaction === "input-focus"
    ) {
      setZIndices(host, [getHighestAncestor(host, intent.sectionId)]);
    }
  }

  return { ...decision, activeIdsChanged };
}
