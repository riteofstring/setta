import {
  type WorkspaceActionResult,
  type WorkspaceCapabilities,
  type WorkspaceController,
  type WorkspaceDocument,
  type WorkspaceDocumentChange,
} from "../core.js";
import {
  applyWorkspaceDocumentCommand,
  type WorkspaceDocumentCommand,
} from "./document-commands.js";

export type WorkspaceControllerBindings<TSectionData> = Readonly<{
  commit(document: WorkspaceDocument<TSectionData>, change: WorkspaceDocumentChange): void;
  getCapabilities(): WorkspaceCapabilities;
  getDocument(): WorkspaceDocument<TSectionData>;
}>;

function dispatch<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
  command: WorkspaceDocumentCommand,
): WorkspaceActionResult {
  const result = applyWorkspaceDocumentCommand(
    bindings.getDocument(),
    command,
    bindings.getCapabilities(),
  );
  if (result.status === "applied") {
    bindings.commit(result.document, { reason: result.reason });
    return { status: "applied" };
  }
  if (result.status === "rejected") {
    return { reason: result.reason, status: "rejected" };
  }
  return { status: "unchanged" };
}

export function createWorkspaceController<TSectionData>(
  bindings: WorkspaceControllerBindings<TSectionData>,
): WorkspaceController<TSectionData> {
  return {
    deleteSections: (sectionIds) => dispatch(bindings, { sectionIds, type: "delete-sections" }),
    getCapabilities: () => ({ ...bindings.getCapabilities() }),
    getDocument: () => bindings.getDocument(),
    setSectionMinimized: (sectionId, isMinimized) =>
      dispatch(bindings, { isMinimized, sectionId, type: "set-section-minimized" }),
    setSectionsLocked: (sectionIds, locked) =>
      dispatch(bindings, { locked, sectionIds, type: "set-sections-locked" }),
    setViewport: (viewport) => dispatch(bindings, { type: "set-viewport", viewport }),
  };
}
