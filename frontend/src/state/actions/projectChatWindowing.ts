import { clearTrackedGitPaneGraphWindowIfMatches } from "./projectChatWindowingEphemeral";

export { clearTrackedGitPaneGraphWindowIfMatches };

export {
  addProjectChatWindowInstanceInState,
  ensureTrackedGitPaneGraphWindow,
  getExternalProjectChatWindowBindingForSectionInState,
  getOpenExternalProjectChatWindowInstanceForSectionInState,
  getProjectChatWindowBindingForSectionInState,
  getProjectChatWindowModeForSectionInState,
  normalizeProjectChatWindowingState,
  resolveDefaultDockedChatHeightPx,
  resolveDefaultFloatingChatBounds,
} from "./projectChatWindowing/instancesAndDocking";

export {
  closeProjectChatWindowInState,
  focusProjectChatWindowInState,
  maximizeProjectChatWindowInState,
  minimizeProjectChatWindowInState,
  moveProjectChatWindowToCanvasSectionInState,
  reopenProjectChatWindowInState,
  setProjectChatWindowBoundsByIdInState,
  setProjectChatWindowBoundsInState,
  setProjectChatWindowDockFractionsInState,
  setProjectChatWindowModeForSectionInState,
  setProjectChatWindowPlacementInState,
  setProjectChatWindowTitleInState,
  showSectionInProjectChatWindowInState,
  undockProjectChatWindowFromCanvasSectionInState,
  unmaximizeProjectChatWindowInState,
} from "./projectChatWindowing/windowingStateMutations";

export {
  bootProjectChatWindowToCanvasSection,
  closeProjectChatWindow,
  createProjectChatWindowInstance,
  flushPendingProjectChatWindowingWrites,
  focusProjectChatWindow,
  maximizeProjectChatWindow,
  minimizeProjectChatWindow,
  reopenProjectChatWindow,
  replaceProjectChatWindowingState,
  setProjectChatWindowBounds,
  setProjectChatWindowBoundsById,
  setProjectChatWindowChatId,
  setProjectChatWindowDockFractions,
  setProjectChatWindowModeForSection,
  setProjectChatWindowPlacement,
  setProjectChatWindowTitle,
  showSectionInProjectChatWindow,
  syncProjectChatWindowingState,
  undockProjectChatWindowFromCanvasSection,
  unmaximizeProjectChatWindow,
} from "./projectChatWindowing/windowingDispatch";
