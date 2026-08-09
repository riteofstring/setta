import type { NodeMouseHandler } from "@xyflow/react";
import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import {
  deriveWorkspaceParentLookup,
  getWorkspaceSectionOrder,
  type WorkspaceActionResult,
  type WorkspaceDocument,
} from "../core.js";
import type { WorkspaceGeometryIndex } from "./geometry-index.js";
import {
  type RootSelectionProjection,
  type WorkspaceRootNode,
} from "./workspace-canvas-root-node.js";
import { useWorkspaceMarqueeSelection } from "./workspace-canvas-selection.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import {
  applyWorkspaceSectionSelectionRequest,
  normalizeWorkspaceSelectionRoots,
  resolveWorkspaceRootSelection,
  resolveWorkspaceStructuralSelection,
  type WorkspaceSectionSelectionRequest,
} from "./workspace-selection.js";

function selectionContainsDetachedSection(
  document: WorkspaceDocument<unknown>,
  selectedSectionIds: readonly string[],
  detachedSectionIds: readonly string[],
): boolean {
  const selectedRoots = new Set(normalizeWorkspaceSelectionRoots(document, selectedSectionIds));
  const parentLookup = deriveWorkspaceParentLookup(document);
  return detachedSectionIds.some((detachedSectionId) => {
    let sectionId: string | null = detachedSectionId;
    while (sectionId !== null) {
      if (selectedRoots.has(sectionId)) {
        return true;
      }
      sectionId = parentLookup.get(sectionId) ?? null;
    }
    return false;
  });
}

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
  detachedSectionIds,
  document,
  geometry,
  geometryIndex,
  marqueeSelectionMode,
  onSelectionChange,
  selectedSectionIds,
}: Readonly<{
  detachedSectionIds: readonly string[];
  document: WorkspaceDocument<TSectionData>;
  geometry: WorkspaceGeometryMeasurements;
  geometryIndex: WorkspaceGeometryIndex;
  marqueeSelectionMode: "full" | "partial";
  onSelectionChange(sectionIds: readonly string[]): WorkspaceActionResult;
  selectedSectionIds: readonly string[];
}>) {
  const documentRef = useRef(document);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const selectedSectionIdsRef = useRef<readonly string[]>(selectedSectionIds);
  documentRef.current = document;
  onSelectionChangeRef.current = onSelectionChange;
  selectedSectionIdsRef.current = selectedSectionIds;
  const [announcementText, setAnnouncementText] = useState("");
  const commitSelection = useCallback((sectionIds: readonly string[]) => {
    const result = onSelectionChangeRef.current(sectionIds);
    if (result.status !== "rejected") {
      selectedSectionIdsRef.current = sectionIds;
      setAnnouncementText(selectionAnnouncement(documentRef.current, sectionIds));
    }
    return result;
  }, []);
  const handleSelectionRequest = useCallback(
    (sectionId: string, request: WorkspaceSectionSelectionRequest) => {
      const nextSelection = applyWorkspaceSectionSelectionRequest(
        documentRef.current,
        selectedSectionIdsRef.current,
        sectionId,
        request,
      );
      commitSelection(nextSelection);
    },
    [commitSelection],
  );
  const rootSelectionProjection = useMemo<RootSelectionProjection>(() => {
    const selectedIds = new Set(selectedSectionIds);
    const activeSelectedRoot = document.rootSections.find(({ sectionId }) =>
      selectedIds.has(sectionId),
    );
    const movement = activeSelectedRoot
      ? resolveWorkspaceRootSelection(document, selectedSectionIds, activeSelectedRoot.sectionId)
      : null;
    const structuralMovement =
      selectedSectionIds.length > 0
        ? resolveWorkspaceStructuralSelection(document, selectedSectionIds)
        : null;
    const detachmentBlocked = selectionContainsDetachedSection(
      document,
      selectedSectionIds,
      detachedSectionIds,
    );
    return {
      movementBlocked: detachmentBlocked || (movement !== null && !movement.allowed),
      selectedSectionIds: selectedIds,
      structuralMovementBlocked:
        detachmentBlocked || (structuralMovement !== null && !structuralMovement.allowed),
    };
  }, [detachedSectionIds, document, selectedSectionIds]);
  const marqueeSelection = useWorkspaceMarqueeSelection({
    geometry,
    geometryIndex,
    mode: marqueeSelectionMode,
    onSelectionChange: commitSelection,
    selectedSectionIds: selectedSectionIdsRef,
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
      const clearsSelection = event.key === "Escape" && selectedSectionIdsRef.current.length > 0;
      if (!selectsAll && !clearsSelection) {
        return;
      }
      commitSelection(selectsAll ? getWorkspaceSectionOrder(documentRef.current) : []);
      event.preventDefault();
      event.stopPropagation();
    },
    [commitSelection],
  );

  return {
    announcementText,
    commitSelection,
    handleCanvasKeyDownCapture,
    handleNodeClick,
    handlePaneClick,
    handleSelectionRequest,
    marqueeSelection,
    rootSelectionProjection,
    selectedSectionIdsRef,
  };
}
