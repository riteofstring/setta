export { snapshotFloatingWindowsForWindowSpace } from "./windowSpaceSnapshotCapture";
export type {
  AuthoringFloatingViewport,
  WindowSpaceSnapshotState,
} from "./windowSpaceSnapshotCapture";
export {
  allocateFreshProjectChatWindowInstanceId,
  buildOrderedProjectChatWindowInstanceIds,
  createProjectChatWindowingStateFromWindowSpace,
  dedupeRestoredSectionBindings,
} from "./windowSpaceSnapshotRestore";
