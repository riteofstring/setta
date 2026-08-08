import { useCallback, useEffect, useRef, useState } from "react";

import type { WorkspaceActionResult, WorkspaceDocument } from "../core.js";

type PendingSectionState = Readonly<{
  kind: "locked" | "minimized";
  sectionId: string;
  title: string;
  value: boolean;
}>;

function sectionStateValue(action: PendingSectionState): string {
  if (action.kind === "locked") {
    return action.value ? "locked" : "unlocked";
  }
  return action.value ? "minimized" : "expanded";
}

function sectionStateAnnouncement(action: PendingSectionState, accepted: boolean): string {
  if (accepted) {
    return `${action.title} ${sectionStateValue(action)}.`;
  }
  const retained = sectionStateValue({ ...action, value: !action.value });
  return `${action.title} remains ${retained} because the host did not accept the change.`;
}

function rejectedSectionStateAnnouncement(action: PendingSectionState, reason: string): string {
  const state = sectionStateValue(action);
  if (reason === "layout-edit-disabled") {
    return `Unable to make ${action.title} ${state}. Turn on layout editing and try again.`;
  }
  if (reason === "presentation-edit-disabled") {
    return `Unable to make ${action.title} ${state}. Turn on presentation editing and try again.`;
  }
  if (reason === "section-not-minimizable") {
    return `${action.title} cannot be minimized.`;
  }
  return `Unable to make ${action.title} ${state}.`;
}

export function useWorkspaceSectionStateActions<TSectionData>({
  document,
  onLockedCommit,
  onMinimizedCommit,
}: Readonly<{
  document: WorkspaceDocument<TSectionData>;
  onLockedCommit(sectionId: string, locked: boolean): WorkspaceActionResult;
  onMinimizedCommit(sectionId: string, isMinimized: boolean): WorkspaceActionResult;
}>) {
  const documentRef = useRef(document);
  const onLockedCommitRef = useRef(onLockedCommit);
  const onMinimizedCommitRef = useRef(onMinimizedCommit);
  documentRef.current = document;
  onLockedCommitRef.current = onLockedCommit;
  onMinimizedCommitRef.current = onMinimizedCommit;

  const [announcementText, setAnnouncementText] = useState("");
  const [synchronizationRevision, setSynchronizationRevision] = useState(0);
  const pendingStateRef = useRef<PendingSectionState | null>(null);

  const recordResult = useCallback((action: PendingSectionState, result: WorkspaceActionResult) => {
    if (result.status === "applied") {
      pendingStateRef.current = action;
    } else {
      pendingStateRef.current = null;
      setAnnouncementText(
        "reason" in result
          ? rejectedSectionStateAnnouncement(action, result.reason)
          : `${action.title} is already ${sectionStateValue(action)}.`,
      );
    }
    setSynchronizationRevision((revision) => revision + 1);
  }, []);

  const handleLockedCommit = useCallback(
    (sectionId: string, locked: boolean) => {
      const section = documentRef.current.sections[sectionId];
      if (!section) {
        throw new Error(`Workspace lock action is missing section ${sectionId}.`);
      }
      const action = { kind: "locked", sectionId, title: section.title, value: locked } as const;
      const result = onLockedCommitRef.current(sectionId, locked);
      recordResult(action, result);
      return result;
    },
    [recordResult],
  );

  const handleMinimizedCommit = useCallback(
    (sectionId: string, isMinimized: boolean) => {
      const section = documentRef.current.sections[sectionId];
      if (!section) {
        throw new Error(`Workspace minimize action is missing section ${sectionId}.`);
      }
      const action = {
        kind: "minimized",
        sectionId,
        title: section.title,
        value: isMinimized,
      } as const;
      const result = onMinimizedCommitRef.current(sectionId, isMinimized);
      recordResult(action, result);
      return result;
    },
    [recordResult],
  );

  useEffect(() => {
    const pendingState = pendingStateRef.current;
    if (!pendingState) {
      return;
    }
    const section = document.sections[pendingState.sectionId];
    const accepted =
      pendingState.kind === "locked"
        ? section?.positionAndSizeLocked === pendingState.value
        : section?.isMinimized === pendingState.value;
    setAnnouncementText(sectionStateAnnouncement(pendingState, accepted));
    pendingStateRef.current = null;
  }, [document.sections, synchronizationRevision]);

  return {
    announcementText,
    handleLockedCommit,
    handleMinimizedCommit,
  };
}
