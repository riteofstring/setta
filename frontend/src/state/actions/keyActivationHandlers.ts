import {
  copyFloatingBoxContent,
  copyFrozenFloatingBoxContent,
  decrementFloatingBoxIdx,
  decrementFrozenFloatingBoxIdx,
  disableFloatingBox,
  enableFloatingBox,
  freezeFloatingBox,
  getConvertFloatingBoxToSectionFn,
  incrementFloatingBoxIdx,
  incrementFrozenFloatingBoxIdx,
  removeFrozenFloatingBox,
} from "components/Utils/FloatingBox";
import {
  activateDndMovingFreeMode,
  activateDndSortingMode,
  deactivateDnd,
} from "forks/dnd-kit/dndState";
import {
  resetZoom,
  zoomIn,
  zoomOut,
} from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import { onFitViewHandler } from "forks/xyflow/core/store/utils";
import { zoomToMouseLocation } from "forks/xyflow/core/utils/mouseLocation";
import {
  activateParamSelect,
  deactivateParamSelect,
} from "state/actions/paramSelect";
import {
  indentSelectedParams,
  moveSelectedParamsDown,
  moveSelectedParamsUp,
  unindentSelectedParams,
} from "state/actions/params/moveParams";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import { useSettings } from "state/stores/uiPreferenceStores";
import { handleTabNavigation } from "utils/focusManager";
import { isBaseSectionWithParamsImpl } from "utils/generatedTypes";
import {
  clearActiveSectionIds,
  selectAll,
  setTopLevelNonGroupSectionsAsActive,
} from "./activeSections";
import { deleteSelectedAgenticEdges } from "./agenticEdgeMutations";
import { copy, paste } from "./copyPaste";
import { deleteSelectedEdges } from "./edges";
import { formatActiveCodeSection } from "./formatCode";
import { getIsInput } from "./keyShortcutInputPolicy";
import { getTabShortcutInfo } from "./keyShortcutMatching";
import { restartLanguageServer } from "./lsp";
import {
  openFileMenuLoadProjectConfigModal,
  openFileMenuSaveProjectConfigAsModal,
} from "./modal";
import { saveProject } from "./project/saveProject";
import {
  deleteAllActiveSections,
  groupActiveSections,
  ungroupActiveGroups,
  unselectAllParams,
} from "./projectStateCommands";
import { runEntryCodeBlock } from "./runOrImportCode";
import {
  addCallableSectionInEmptySpace,
  addGroupInEmptySpace,
  addTerminalInEmptySpace,
} from "./sections/createSections";
import {
  focusOnAdvancedSearch,
  focusOnCommandPalette,
  focusOnSearch,
} from "./sections/sectionParamFilter";
import { deleteSelectedStateMachineEdges } from "./stateMachineEdgeMutations";
import { redoProjectState, undoProjectState } from "./undo";

export const keyActivationCommands = {
  addCallableSectionInEmptySpace,
  addGroupInEmptySpace,
  addTerminalInEmptySpace,
  activateDndMovingFreeMode,
  activateDndSortingMode,
  activateMoveSectionMode,
  activateMultiSelectionPressed,
  activatePanMode,
  activateParamSelect,
  activateSelectionKeyPressed,
  activateZoomMode,
  copy,
  copyFloatingBoxContent,
  copyFrozenFloatingBoxContent,
  deactivateDnd,
  deactivateMoveSectionMode,
  deactivateMultiSelectionPressed,
  deactivatePanMode,
  deactivateParamSelect,
  deactivateSelectionKeyPressed,
  deactivateZoomMode,
  decrementFloatingBoxIdx,
  decrementFrozenFloatingBoxIdx,
  deleteEdgesOrSections,
  disableFloatingBox,
  enableFloatingBox,
  focusOnAdvancedSearch,
  focusOnCommandPalette,
  focusOnSearch,
  formatActiveCodeSection,
  freezeFloatingBox,
  getConvertFloatingBoxToSectionFn,
  groupActiveSections,
  incrementFloatingBoxIdx,
  incrementFrozenFloatingBoxIdx,
  moveSelectedParamsDown,
  moveSelectedParamsUp,
  indentSelectedParams,
  onEscapeKey,
  onFitViewHandler,
  openFileMenuLoadProjectConfigModal,
  openFileMenuSaveProjectConfigAsModal,
  paste,
  redoProjectState,
  resetZoom,
  restartLanguageServer,
  runEntryCodeBlock,
  saveProject,
  selectAll,
  setTopLevelNonGroupSectionsAsActive,
  ungroupActiveGroups,
  unindentSelectedParams,
  undoProjectState,
  zoomIn,
  zoomOut,
  zoomToMouseLocation,
};

export function deleteEdgesOrSections() {
  const deletedEdges = deleteSelectedEdges();
  const deletedAgenticEdges = deleteSelectedAgenticEdges();
  const deletedStateMachineEdges = deleteSelectedStateMachineEdges();
  if (!deletedEdges && !deletedAgenticEdges && !deletedStateMachineEdges) {
    deleteAllActiveSections();
  }
}

export function runParamShortcut(
  action: () => boolean | void,
  event: KeyboardEvent,
) {
  if (getIsInput(event)) {
    return;
  }
  const didRun = action();
  if (didRun) {
    event.preventDefault();
  }
}

export function onEscapeKey(event: KeyboardEvent) {
  removeFrozenFloatingBox();
  const target = event.target instanceof HTMLElement ? event.target : null;
  const sectionNode = target?.closest(".react-flow__node");
  if (getIsInput(event) && !sectionNode) {
    return;
  }
  const didUnselectSomeParams = unselectAllParams();
  if (!didUnselectSomeParams && sectionNode) {
    const sectionId = sectionNode.getAttribute("data-id");
    const activeIds = getActiveSectionUIIds();
    if (sectionId && activeIds.includes(sectionId)) {
      clearActiveSectionIds();
      const activeElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (
        activeElement &&
        activeElement !== document.body &&
        activeElement !== document.documentElement
      ) {
        activeElement.blur();
      }
      const postBlurActive =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      if (
        postBlurActive &&
        postBlurActive !== document.body &&
        postBlurActive !== document.documentElement
      ) {
        document.body.focus({ preventScroll: true });
        if (
          document.activeElement !== document.body &&
          document.activeElement !== document.documentElement
        ) {
          document.documentElement.focus({ preventScroll: true });
        }
      }
    }
  }
}

export function handleTabKeyDown(event: KeyboardEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (target?.closest("[data-tab-native]")) {
    return;
  }
  if (activeSectionHasSelectedParams()) {
    const action = resolveTabParamAction(event);
    if (action === "indent") {
      indentSelectedParams();
      event.preventDefault();
      return;
    }
    if (action === "unindent") {
      unindentSelectedParams();
      event.preventDefault();
      return;
    }
  }

  const didHandle = handleTabNavigation(event);
  if (didHandle) {
    event.preventDefault();
  }
}

export function resolveTabParamAction(event: KeyboardEvent) {
  const shortcuts = useSettings.getState().shortcuts;
  const indentTab = getTabShortcutInfo(shortcuts.paramIndentShortcut);
  const unindentTab = getTabShortcutInfo(shortcuts.paramUnindentShortcut);
  if (event.shiftKey) {
    if (unindentTab?.shift) {
      return "unindent";
    }
    if (indentTab?.shift) {
      return "indent";
    }
    return null;
  }
  if (indentTab && !indentTab.shift) {
    return "indent";
  }
  if (unindentTab && !unindentTab.shift) {
    return "unindent";
  }
  return null;
}

export function activeSectionHasSelectedParams(): boolean {
  const state = useProjectState.getState();
  const activeId = getActiveSectionUIIds()[0];
  if (!activeId) {
    return false;
  }
  const impl = getCurrEffectiveSectionImpl(state, activeId);
  return isBaseSectionWithParamsImpl(impl) && impl.selectedParams.length > 0;
}

export function activateSelectionKeyPressed() {
  useReactFlow.setState({ selectionKeyPressed: true });
}

export function deactivateSelectionKeyPressed() {
  useReactFlow.setState({ selectionKeyPressed: false });
}

export function activateMultiSelectionPressed() {
  useReactFlow.setState({ multiSelectionActive: true });
}

export function deactivateMultiSelectionPressed() {
  useReactFlow.setState({ multiSelectionActive: false });
}

export function activatePanMode() {
  useReactFlow.setState({ panActivationKeyPressed: true });
}

export function deactivatePanMode() {
  useReactFlow.setState({ panActivationKeyPressed: false });
}

export function activateZoomMode() {
  useReactFlow.setState({ zoomActivationKeyPressed: true });
}

export function deactivateZoomMode() {
  useReactFlow.setState({ zoomActivationKeyPressed: false });
}

export function activateMoveSectionMode() {
  useReactFlow.setState({ moveSectionActivationKeyPressed: true });
}

export function deactivateMoveSectionMode() {
  useReactFlow.setState({ moveSectionActivationKeyPressed: false });
}
