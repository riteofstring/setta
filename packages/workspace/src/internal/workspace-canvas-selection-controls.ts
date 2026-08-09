import type { NodeMouseHandler } from "@xyflow/react";
import { useCallback, useRef, type KeyboardEvent, type MouseEvent } from "react";

import type { WorkspaceActionResult, WorkspaceDocument } from "../core.js";
import type { WorkspaceGeometryIndex } from "./geometry-index.js";
import { type WorkspaceRootNode } from "./workspace-canvas-root-node.js";
import { useWorkspaceMarqueeSelection } from "./workspace-canvas-selection.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import type { WorkspaceSelectionStore } from "./workspace-selection-store.js";
import {
  applyWorkspaceSectionSelectionRequest,
  resolveWorkspaceStructuralSelection,
  type WorkspaceSectionSelectionRequest,
} from "./workspace-selection.js";

function selectionAnnouncement<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  selectedSectionIds: readonly string[],
): string {
  if (selectedSectionIds.length === 0) {
    return "Selection cleared.";
  }
  const selectedSections = selectedSectionIds.flatMap((sectionId) => {
    const section = document.sections[sectionId];
    return section ? [section] : [];
  });
  const subject =
    selectedSections.length === 1
      ? `${selectedSections[0]?.title ?? "Section"} selected.`
      : `${String(selectedSections.length)} sections selected.`;
  const movement = resolveWorkspaceStructuralSelection(document, selectedSectionIds);
  return movement.allowed ? subject : `${subject} ${movement.reason}`;
}

export function targetAcceptsWorkspaceCanvasShortcut(
  target: EventTarget | null,
  ownerDocument: Document,
): boolean {
  const ElementConstructor = ownerDocument.defaultView?.Element;
  if (!ElementConstructor || !(target instanceof ElementConstructor)) {
    return true;
  }
  return !target.closest(
    "input, select, textarea, [contenteditable='true'], [data-workspace-local-shortcuts]",
  );
}

function clickedWorkspaceSectionId<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  event: MouseEvent<Element>,
  rootSectionId: string,
): string | null {
  const ElementConstructor = event.currentTarget.ownerDocument.defaultView?.Element;
  const target = event.target;
  if (!ElementConstructor || !(target instanceof ElementConstructor)) {
    return rootSectionId;
  }
  if (target.closest(".setta-workspace__section-drag-handle, [data-workspace-selection-control]")) {
    return null;
  }
  const frameSectionId = target.closest<HTMLElement>(
    ".setta-workspace__section-frame[data-workspace-section-id]",
  )?.dataset.workspaceSectionId;
  return frameSectionId && Object.hasOwn(document.sections, frameSectionId)
    ? frameSectionId
    : rootSectionId;
}

export function useWorkspaceCanvasSelectionControls<TSectionData>({
  document,
  geometry,
  geometryIndex,
  marqueeSelectionMode,
  onSelectionChange,
  selectionStore,
  visibleSectionIds,
}: Readonly<{
  document: WorkspaceDocument<TSectionData>;
  geometry: WorkspaceGeometryMeasurements;
  geometryIndex: WorkspaceGeometryIndex;
  marqueeSelectionMode: "full" | "partial";
  onSelectionChange(sectionIds: readonly string[]): WorkspaceActionResult;
  selectionStore: WorkspaceSelectionStore;
  visibleSectionIds: readonly string[];
}>) {
  const documentRef = useRef(document);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const visibleSectionIdsRef = useRef<readonly string[]>(visibleSectionIds);
  documentRef.current = document;
  onSelectionChangeRef.current = onSelectionChange;
  visibleSectionIdsRef.current = visibleSectionIds;
  const commitSelection = useCallback(
    (sectionIds: readonly string[]) => {
      const result = onSelectionChangeRef.current(sectionIds);
      if (result.status !== "rejected") {
        selectionStore.announce(
          selectionAnnouncement(documentRef.current, selectionStore.getSnapshot().sectionIds),
        );
      }
      return result;
    },
    [selectionStore],
  );
  const handleSelectionRequest = useCallback(
    (sectionId: string, request: WorkspaceSectionSelectionRequest) => {
      const nextSelection = applyWorkspaceSectionSelectionRequest(
        documentRef.current,
        selectionStore.getSnapshot().sectionIds,
        sectionId,
        request,
      );
      commitSelection(nextSelection);
    },
    [commitSelection, selectionStore],
  );
  const getSelectedSectionIds = useCallback(
    () => selectionStore.getSnapshot().sectionIds,
    [selectionStore],
  );
  const marqueeSelection = useWorkspaceMarqueeSelection({
    geometry,
    geometryIndex,
    getSelectedSectionIds,
    mode: marqueeSelectionMode,
    onSelectionChange: commitSelection,
  });
  const handlePaneClick = useCallback(() => {
    commitSelection([]);
  }, [commitSelection]);
  const handleNodeClick = useCallback<NodeMouseHandler<WorkspaceRootNode>>(
    (event, node) => {
      const sectionId = clickedWorkspaceSectionId(documentRef.current, event, node.id);
      if (!sectionId) {
        return;
      }
      handleSelectionRequest(sectionId, {
        additive: event.shiftKey,
        preserveSelected: false,
      });
    },
    [handleSelectionRequest],
  );
  const handleCanvasKeyDownCapture = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!targetAcceptsWorkspaceCanvasShortcut(event.target, event.currentTarget.ownerDocument)) {
        return;
      }
      const selectsAll =
        event.key.toLowerCase() === "a" && (event.ctrlKey || event.metaKey) && !event.altKey;
      const clearsSelection =
        event.key === "Escape" && selectionStore.getSnapshot().sectionIds.length > 0;
      if (!selectsAll && !clearsSelection) {
        return;
      }
      commitSelection(selectsAll ? visibleSectionIdsRef.current : []);
      event.preventDefault();
      event.stopPropagation();
    },
    [commitSelection, selectionStore],
  );

  return {
    commitSelection,
    handleCanvasKeyDownCapture,
    handleNodeClick,
    handlePaneClick,
    handleSelectionRequest,
    marqueeSelection,
  };
}
