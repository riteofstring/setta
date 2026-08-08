import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";

import type { WorkspaceActionResult, WorkspaceDocument } from "../core.js";
import {
  type RootProjectionChange,
  type TransientRootProjection,
} from "./transient-root-projection.js";
import { setResizingRoot, type WorkspaceRootNode } from "./workspace-canvas-root-node.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import type { WorkspaceSectionRegistry } from "./workspace-section-registry.js";
import type { WorkspaceSectionResizeBindings } from "./workspace-section-resize-controls.js";
import {
  resizeWorkspaceSectionWithKeyboard,
  workspaceSectionContentAxes,
  workspaceSectionMeasuredSize,
  workspaceSectionResizeAxes,
  workspaceSectionSizeModeLabel,
  type WorkspaceRootResizeSnapshot,
  type WorkspaceSectionResizeAxis,
} from "./workspace-section-sizing.js";

type PendingRootSizing =
  | Readonly<{
      axes: readonly WorkspaceSectionResizeAxis[];
      kind: "content";
      sectionId: string;
      title: string;
    }>
  | Readonly<{
      axes: readonly WorkspaceSectionResizeAxis[];
      kind: "resize";
      resize: WorkspaceRootResizeSnapshot;
      sectionId: string;
      title: string;
    }>;

type ActiveRootResize = Readonly<{
  axes: readonly WorkspaceSectionResizeAxis[];
  sectionId: string;
  title: string;
}>;

function rejectedSizingAnnouncement(title: string, reason: string): string {
  if (reason === "layout-edit-disabled") {
    return `${title} cannot resize because layout editing is off.`;
  }
  if (reason === "section-locked") {
    return `${title} is locked. Unlock it to resize it.`;
  }
  if (reason === "section-minimized") {
    return `${title} must be expanded before it can resize.`;
  }
  return `Unable to resize ${title}.`;
}

function sizingAnnouncement(action: PendingRootSizing, result: WorkspaceActionResult): string {
  if (result.status === "rejected") {
    return rejectedSizingAnnouncement(action.title, result.reason);
  }
  if (action.kind === "content") {
    const label = workspaceSectionSizeModeLabel(action.axes);
    return result.status === "applied"
      ? `${action.title} now fits ${label} to content.`
      : `${action.title} already fits ${label} to content.`;
  }
  const size = action.resize.size;
  return result.status === "applied"
    ? `${action.title} resized to ${String(size.width)} by ${String(size.height)}.`
    : `${action.title} stayed at its previous size.`;
}

function pendingSizingAccepted<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  action: PendingRootSizing,
): boolean {
  const section = document.sections[action.sectionId];
  if (!section) {
    return false;
  }
  if (action.kind === "content") {
    return action.axes.every((axis) => section.size[axis].mode === "content");
  }
  const root = document.rootSections.find(({ sectionId }) => sectionId === action.sectionId);
  if (!root) {
    return false;
  }
  return (
    root.position.x === action.resize.position.x &&
    root.position.y === action.resize.position.y &&
    action.axes.every(
      (axis) =>
        section.size[axis].mode === "fixed" &&
        section.size[axis].value === action.resize.size[axis],
    )
  );
}

function resizeProjectionChanges(
  sectionId: string,
  resize: WorkspaceRootResizeSnapshot,
  resizing: boolean,
): readonly RootProjectionChange[] {
  return [
    {
      dragging: false,
      position: resize.position,
      sectionId,
      type: "position",
    },
    {
      resizing,
      sectionId,
      size: resize.size,
      type: "dimensions",
    },
  ];
}

export function useWorkspaceCanvasRootResizing<TSectionData>({
  document,
  geometry,
  gridOptions,
  onRootResizeCommit,
  onSectionContentSizeCommit,
  rootProjection,
  sectionRegistry,
  setNodes,
}: Readonly<{
  document: WorkspaceDocument<TSectionData>;
  geometry: WorkspaceGeometryMeasurements;
  gridOptions: ResolvedWorkspaceGridOptions;
  onRootResizeCommit(
    sectionId: string,
    axes: readonly WorkspaceSectionResizeAxis[],
    resize: WorkspaceRootResizeSnapshot,
  ): WorkspaceActionResult;
  onSectionContentSizeCommit(
    sectionId: string,
    axes: readonly WorkspaceSectionResizeAxis[],
  ): WorkspaceActionResult;
  rootProjection: TransientRootProjection;
  sectionRegistry: WorkspaceSectionRegistry<TSectionData>;
  setNodes: Dispatch<SetStateAction<WorkspaceRootNode[]>>;
}>) {
  const documentRef = useRef(document);
  const gridOptionsRef = useRef(gridOptions);
  const onRootResizeCommitRef = useRef(onRootResizeCommit);
  const onSectionContentSizeCommitRef = useRef(onSectionContentSizeCommit);
  documentRef.current = document;
  gridOptionsRef.current = gridOptions;
  onRootResizeCommitRef.current = onRootResizeCommit;
  onSectionContentSizeCommitRef.current = onSectionContentSizeCommit;
  const [announcementText, setAnnouncementText] = useState("");
  const [revision, setRevision] = useState(0);
  const activeRootResizeRef = useRef<ActiveRootResize | null>(null);
  const pendingRootSizingRef = useRef<PendingRootSizing | null>(null);

  const recordSizingResult = useCallback(
    (action: PendingRootSizing, result: WorkspaceActionResult) => {
      if (result.status === "applied") {
        pendingRootSizingRef.current = action;
      } else {
        pendingRootSizingRef.current = null;
        setAnnouncementText(sizingAnnouncement(action, result));
      }
      setRevision((current) => current + 1);
    },
    [],
  );
  const handlePointerResize = useCallback<WorkspaceSectionResizeBindings["onPointerResize"]>(
    (sectionId, handle, resize) => {
      let activeResize = activeRootResizeRef.current;
      if (!activeResize) {
        const currentDocument = documentRef.current;
        const root = currentDocument.rootSections.find((entry) => entry.sectionId === sectionId);
        const section = currentDocument.sections[sectionId];
        const definition = section ? sectionRegistry.definition(section.kind) : undefined;
        if (!root || !section || !definition) {
          throw new Error(`Workspace root resize is missing section ${sectionId}.`);
        }
        geometry.flushMeasurement();
        const baseline = {
          position: root.position,
          size: workspaceSectionMeasuredSize(section, geometry.workspaceRect(sectionId)),
        };
        rootProjection.applyRootChanges(resizeProjectionChanges(sectionId, baseline, false));
        rootProjection.beginRootResize(sectionId);
        activeResize = {
          axes: workspaceSectionResizeAxes(definition, handle),
          sectionId,
          title: section.title,
        };
        activeRootResizeRef.current = activeResize;
        setNodes((current) => setResizingRoot(current, sectionId));
        setAnnouncementText(`Resizing ${section.title}.`);
      }
      if (activeResize.sectionId !== sectionId) {
        throw new Error(
          `Workspace root resize changed from ${activeResize.sectionId} to ${sectionId}.`,
        );
      }
      rootProjection.applyRootChanges(resizeProjectionChanges(sectionId, resize, true));
      geometry.requestMeasurement();
    },
    [geometry, rootProjection, sectionRegistry, setNodes],
  );
  const handlePointerResizeEnd = useCallback<WorkspaceSectionResizeBindings["onPointerResizeEnd"]>(
    (sectionId, _handle, resize) => {
      const activeResize = activeRootResizeRef.current;
      if (!activeResize) {
        return;
      }
      if (activeResize.sectionId !== sectionId) {
        throw new Error(
          `Workspace root resize ended on ${sectionId} instead of ${activeResize.sectionId}.`,
        );
      }
      rootProjection.applyRootChanges(resizeProjectionChanges(sectionId, resize, false));
      const command = rootProjection.completeRootGesture();
      activeRootResizeRef.current = null;
      setNodes((current) => setResizingRoot(current, null));
      if (!command || command.type !== "resize-root-section") {
        setAnnouncementText(`${activeResize.title} stayed at its previous size.`);
        return;
      }
      const action: PendingRootSizing = {
        axes: activeResize.axes,
        kind: "resize",
        resize: { position: command.position, size: command.size },
        sectionId,
        title: activeResize.title,
      };
      const result = onRootResizeCommitRef.current(sectionId, action.axes, action.resize);
      recordSizingResult(action, result);
    },
    [recordSizingResult, rootProjection, setNodes],
  );
  const handleKeyboardResize = useCallback<WorkspaceSectionResizeBindings["onKeyboardResize"]>(
    (sectionId, handle, inlineEnd, key) => {
      const currentDocument = documentRef.current;
      const root = currentDocument.rootSections.find((entry) => entry.sectionId === sectionId);
      const section = currentDocument.sections[sectionId];
      const definition = section ? sectionRegistry.definition(section.kind) : undefined;
      if (!root || !section || !definition) {
        throw new Error(`Workspace keyboard resize is missing section ${sectionId}.`);
      }
      geometry.flushMeasurement();
      const resize = resizeWorkspaceSectionWithKeyboard({
        current: workspaceSectionMeasuredSize(section, geometry.workspaceRect(sectionId)),
        definition,
        gridOptions: gridOptionsRef.current,
        handle,
        inlineEnd,
        key,
        position: root.position,
      });
      if (!resize) {
        setAnnouncementText(`${section.title} is already at its resize limit.`);
        return;
      }
      const action: PendingRootSizing = {
        axes: workspaceSectionResizeAxes(definition, handle),
        kind: "resize",
        resize,
        sectionId,
        title: section.title,
      };
      const result = onRootResizeCommitRef.current(sectionId, action.axes, resize);
      recordSizingResult(action, result);
    },
    [geometry, recordSizingResult, sectionRegistry],
  );
  const handleContentSizeRequest = useCallback<
    WorkspaceSectionResizeBindings["onContentSizeRequest"]
  >(
    (sectionId, handle) => {
      const section = documentRef.current.sections[sectionId];
      const definition = section ? sectionRegistry.definition(section.kind) : undefined;
      if (!section || !definition) {
        throw new Error(`Workspace content sizing is missing section ${sectionId}.`);
      }
      const axes = workspaceSectionContentAxes(definition, handle);
      if (axes.length === 0) {
        setAnnouncementText(`${section.title} does not support content sizing here.`);
        return;
      }
      const action: PendingRootSizing = {
        axes,
        kind: "content",
        sectionId,
        title: section.title,
      };
      const result = onSectionContentSizeCommitRef.current(sectionId, axes);
      recordSizingResult(action, result);
    },
    [recordSizingResult, sectionRegistry],
  );
  const bindings = useMemo<WorkspaceSectionResizeBindings>(
    () => ({
      onContentSizeRequest: handleContentSizeRequest,
      onKeyboardResize: handleKeyboardResize,
      onPointerResize: handlePointerResize,
      onPointerResizeEnd: handlePointerResizeEnd,
    }),
    [handleContentSizeRequest, handleKeyboardResize, handlePointerResize, handlePointerResizeEnd],
  );
  const cancel = useCallback(() => {
    const resizing = activeRootResizeRef.current !== null;
    activeRootResizeRef.current = null;
    if (resizing) {
      setAnnouncementText("Resize canceled.");
    }
  }, []);
  const synchronize = useCallback((canonicalDocument: WorkspaceDocument<TSectionData>) => {
    activeRootResizeRef.current = null;
    const pendingSizing = pendingRootSizingRef.current;
    if (!pendingSizing) {
      return;
    }
    setAnnouncementText(
      sizingAnnouncement(
        pendingSizing,
        pendingSizingAccepted(canonicalDocument, pendingSizing)
          ? { status: "applied" }
          : { status: "unchanged" },
      ),
    );
    pendingRootSizingRef.current = null;
  }, []);

  return { announcementText, bindings, cancel, revision, synchronize };
}
