export {
  createProjectChatWindowingStateFromWindowSpace,
  deleteWindowSpace,
  getProjectWindowSpaces,
  persistWindowSpaceSortOrder,
  setWindowSpaceName,
  snapshotFloatingWindowsForWindowSpace,
  sortWindowSpaces,
} from "./windowSpaces/windowSpaceRestore";

export {
  createWindowSpaceFromCurrentFloatingWindows,
  restoreWindowSpaceInWorkspace,
} from "./windowSpaces/windowSpaceCreate";
