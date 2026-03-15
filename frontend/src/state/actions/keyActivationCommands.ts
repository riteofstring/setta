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
import {
  selectAll,
  setTopLevelNonGroupSectionsAsActive,
} from "./activeSections";
import { deleteSelectedAgenticEdges } from "./agenticEdgeMutations";
import { copy, paste } from "./copyPaste";
import { deleteSelectedEdges } from "./edges";
import { formatActiveCodeSection } from "./formatCode";
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

export function deleteEdgesOrSections() {
  const deletedEdges = deleteSelectedEdges();
  const deletedAgenticEdges = deleteSelectedAgenticEdges();
  const deletedStateMachineEdges = deleteSelectedStateMachineEdges();
  if (!deletedEdges && !deletedAgenticEdges && !deletedStateMachineEdges) {
    deleteAllActiveSections();
  }
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
