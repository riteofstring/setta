import { useCallback, useRef, useState, type RefObject } from "react";

import type {
  WorkspaceActionRejectionReason,
  WorkspaceActionResult,
  WorkspaceCapabilities,
  WorkspaceDocument,
  WorkspaceDocumentChange,
  WorkspaceHistoryState,
} from "../core.js";
import type { WorkspaceCanvasController } from "./workspace-canvas-navigation.js";
import type { WorkspaceControllerBindings } from "./workspace-controller.js";
import {
  WorkspaceDocumentHistory,
  type WorkspaceHistorySynchronization,
} from "./workspace-history.js";

type WorkspaceHistoryDirection = "redo" | "undo";

function historyRejectionAnnouncement(
  direction: WorkspaceHistoryDirection,
  result: Extract<WorkspaceActionResult, { status: "rejected" }>,
): string {
  const action = direction === "undo" ? "Undo" : "Redo";
  const policies: Partial<Record<WorkspaceActionRejectionReason, string>> = {
    "layout-edit-disabled": "layout editing is disabled",
    "presentation-edit-disabled": "presentation editing is disabled",
    "structure-edit-disabled": "structure editing is disabled",
  };
  const policy = policies[result.reason];
  return `${action} unavailable: ${policy ?? result.reason}.`;
}

function navigateWorkspaceHistory<TSectionData>(
  direction: WorkspaceHistoryDirection,
  history: WorkspaceDocumentHistory<TSectionData>,
  bindings: WorkspaceControllerBindings<TSectionData>,
  onHistoryChange: () => void,
  onAnnouncement: (announcement: string) => void,
): WorkspaceActionResult {
  const plan = history.navigate(direction, bindings.getDocument(), bindings.getCapabilities());
  if (plan.status === "applied") {
    onHistoryChange();
    bindings.commit(plan.document, plan.change);
    return { status: "applied" };
  }
  const action = direction === "undo" ? "undo" : "redo";
  onAnnouncement(
    plan.status === "unchanged"
      ? `Nothing to ${action}.`
      : historyRejectionAnnouncement(direction, plan),
  );
  return plan;
}

function historySynchronizationAnnouncement(
  synchronization: WorkspaceHistorySynchronization,
): string | null {
  if (!synchronization.direction) {
    return null;
  }
  const action = synchronization.direction === "undo" ? "Undo" : "Redo";
  if (synchronization.navigationAccepted) {
    return `${action} complete.`;
  }
  return synchronization.navigationRejected
    ? `${action} was not accepted by the controlled host.`
    : null;
}

function synchronizeWorkspaceHistory<TSectionData>({
  canvasController,
  commitSelection,
  controlled,
  document,
  focusAnchor,
  history,
  onAnnouncement,
  onHistoryChange,
  selection,
}: Readonly<{
  canvasController: WorkspaceCanvasController | null;
  commitSelection(sectionIds: readonly string[]): WorkspaceActionResult;
  controlled: boolean;
  document: WorkspaceDocument<TSectionData>;
  focusAnchor: Element | null;
  history: WorkspaceDocumentHistory<TSectionData>;
  onAnnouncement(announcement: string): void;
  onHistoryChange(): void;
  selection: readonly string[];
}>): WorkspaceHistorySynchronization {
  const synchronization = history.synchronize(document, selection, controlled);
  if (!synchronization.stateChanged) {
    return synchronization;
  }
  if (synchronization.selection !== null) {
    commitSelection(synchronization.selection);
  }
  const announcement = historySynchronizationAnnouncement(synchronization);
  if (announcement) {
    onAnnouncement(announcement);
  }
  if (synchronization.navigationAccepted) {
    void canvasController?.recoverFocus(synchronization.selection?.[0] ?? null, focusAnchor);
  }
  onHistoryChange();
  return synchronization;
}

export type WorkspaceHistoryCoordinator<TSectionData> = Readonly<{
  announcement: string;
  getState(): WorkspaceHistoryState;
  navigate(
    direction: WorkspaceHistoryDirection,
    bindings: WorkspaceControllerBindings<TSectionData>,
  ): WorkspaceActionResult;
  stageCommit(
    before: WorkspaceDocument<TSectionData>,
    after: WorkspaceDocument<TSectionData>,
    change: WorkspaceDocumentChange,
  ): void;
  synchronize(): void;
  synchronizationRevision: number;
}>;

export function useWorkspaceHistoryCoordinator<TSectionData>({
  canvasControllerRef,
  capabilitiesRef,
  commitSelection,
  controlledRef,
  document,
  selectionRef,
}: Readonly<{
  canvasControllerRef: RefObject<WorkspaceCanvasController | null>;
  capabilitiesRef: RefObject<WorkspaceCapabilities>;
  commitSelection(sectionIds: readonly string[]): WorkspaceActionResult;
  controlledRef: RefObject<boolean>;
  document: WorkspaceDocument<TSectionData>;
  selectionRef: RefObject<readonly string[]>;
}>): WorkspaceHistoryCoordinator<TSectionData> {
  const [history] = useState(() => new WorkspaceDocumentHistory(document));
  const pendingFocusAnchorRef = useRef<Element | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [revision, setRevision] = useState(0);
  const onHistoryChange = useCallback(() => setRevision((current) => current + 1), []);
  const getState = useCallback(
    () => history.state(capabilitiesRef.current),
    [capabilitiesRef, history],
  );
  const navigate = useCallback(
    (direction: WorkspaceHistoryDirection, bindings: WorkspaceControllerBindings<TSectionData>) => {
      const focusAnchor = canvasControllerRef.current?.captureFocus() ?? null;
      const result = navigateWorkspaceHistory(
        direction,
        history,
        bindings,
        onHistoryChange,
        setAnnouncement,
      );
      if (result.status === "applied") {
        pendingFocusAnchorRef.current = focusAnchor;
      }
      return result;
    },
    [canvasControllerRef, history, onHistoryChange],
  );
  const stageCommit = useCallback(
    (
      before: WorkspaceDocument<TSectionData>,
      after: WorkspaceDocument<TSectionData>,
      change: WorkspaceDocumentChange,
    ) => {
      if (history.stageCommit(before, after, change, selectionRef.current)) {
        onHistoryChange();
      }
    },
    [history, onHistoryChange, selectionRef],
  );
  const synchronize = useCallback(() => {
    const synchronization = synchronizeWorkspaceHistory({
      canvasController: canvasControllerRef.current,
      commitSelection,
      controlled: controlledRef.current,
      document,
      focusAnchor: pendingFocusAnchorRef.current,
      history,
      onAnnouncement: setAnnouncement,
      onHistoryChange,
      selection: selectionRef.current,
    });
    if (synchronization.navigationAccepted || synchronization.navigationRejected) {
      pendingFocusAnchorRef.current = null;
    }
  }, [
    canvasControllerRef,
    commitSelection,
    controlledRef,
    document,
    history,
    onHistoryChange,
    selectionRef,
  ]);

  return {
    announcement,
    getState,
    navigate,
    stageCommit,
    synchronize,
    synchronizationRevision: revision,
  };
}
