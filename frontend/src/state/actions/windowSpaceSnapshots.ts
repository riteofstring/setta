export { snapshotFloatingWindowsForWindowSpace } from "./windowSpaceSnapshotCapture";
export type {
  AuthoringFloatingViewport,
  WindowSpaceSnapshotState,
} from "./windowSpaceSnapshotCapture";
export { createProjectChatWindowingStateFromWindowSpace } from "./windowSpaceSnapshotRestoreConversion";
export {
  allocateFreshProjectChatWindowInstanceId,
  buildOrderedProjectChatWindowInstanceIds,
} from "./windowSpaceSnapshotRestoreInstanceIds";
export { dedupeRestoredSectionBindings } from "./windowSpaceSnapshotRestoreSectionBindings";
