import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { WorkspaceActionResult, WorkspaceDocument } from "../core.js";
import type { WorkspaceGeometryIndex } from "./geometry-index.js";
import type { InteractionInput } from "./interaction-owner.js";
import type { SectionMovePlan, WorkspaceSectionMoveMode } from "./section-move-planning.js";
import type { SectionHierarchySnapshot } from "./selection-planning.js";
import {
  UpstreamDndBoundary,
  useUpstreamDndDraggable,
  type AdapterDndCompletion,
  type AdapterDndEvent,
} from "./upstream-dnd-adapter.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import type { WorkspaceStructuralInteractionStart } from "./workspace-interaction-owner.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import { workspaceDocumentMatchesSectionMove } from "./workspace-section-move-command.js";
import type { WorkspaceSectionMoveFeedbackStore } from "./workspace-section-move-feedback.js";
import {
  createWorkspaceSectionMoveSession,
  matchingWorkspaceSectionMovePreview,
  resolveWorkspaceSectionMovePreview,
  workspaceSectionMoveCompletionAnnouncement,
  workspaceSectionMoveControlledRejectionAnnouncement,
  workspaceSectionMoveMismatchAnnouncement,
  workspaceSectionMovePendingAnnouncement,
  type WorkspaceSectionMoveSession,
} from "./workspace-section-move-session.js";
import type { WorkspaceSectionSelectionRequest } from "./workspace-selection.js";

const ROOT_SECTION_DND_PREFIX = "setta-workspace-root-section:";
const NESTED_SECTION_DND_PREFIX = "setta-workspace-nested-section:";

type WorkspaceSectionDndSource = Readonly<{
  root: boolean;
  sectionId: string;
}>;

type WorkspaceSectionDndContextValue = Readonly<{
  activationEnabled: boolean;
  activeSectionId: string | null;
  activeSectionMode: WorkspaceSectionMoveMode | null;
  layoutEditable: boolean;
  mode: WorkspaceSectionMoveMode;
  registerHandle(sectionId: string, element: Element): void;
  rootLayoutActive: boolean;
  structureEditable: boolean;
  unregisterHandle(sectionId: string, element: Element): void;
}>;

const WorkspaceSectionDndContext = createContext<WorkspaceSectionDndContextValue | null>(null);
const DISABLED_SECTION_DND_CONTEXT: WorkspaceSectionDndContextValue = {
  activationEnabled: false,
  activeSectionId: null,
  activeSectionMode: null,
  layoutEditable: false,
  mode: "sort",
  registerHandle: () => undefined,
  rootLayoutActive: false,
  structureEditable: false,
  unregisterHandle: () => undefined,
};

function sourceId(sectionId: string, root: boolean): string {
  return `${root ? ROOT_SECTION_DND_PREFIX : NESTED_SECTION_DND_PREFIX}${sectionId}`;
}

function workspaceSectionDndSource(id: string): WorkspaceSectionDndSource {
  if (id.startsWith(ROOT_SECTION_DND_PREFIX)) {
    return { root: true, sectionId: id.slice(ROOT_SECTION_DND_PREFIX.length) };
  }
  if (id.startsWith(NESTED_SECTION_DND_PREFIX)) {
    return { root: false, sectionId: id.slice(NESTED_SECTION_DND_PREFIX.length) };
  }
  throw new Error(`Unknown workspace section drag source ${JSON.stringify(id)}.`);
}

function interactionInput(input: AdapterDndEvent["input"]): InteractionInput {
  return input;
}

function sectionUsesStructuralDrag(
  context: WorkspaceSectionDndContextValue,
  depth: number,
  sectionId: string,
): boolean {
  if (depth === 0 && context.rootLayoutActive) {
    return false;
  }
  return context.activeSectionId === sectionId || depth > 0 || context.mode === "free";
}

function sectionStructuralDragEnabled(
  context: WorkspaceSectionDndContextValue,
  blocked: boolean,
  sectionId: string,
  structural: boolean,
): boolean {
  if (blocked || !structural) {
    return false;
  }
  return (
    context.activeSectionId === sectionId ||
    (context.activationEnabled && context.layoutEditable && context.structureEditable)
  );
}

function sectionStructuralDragMode(
  context: WorkspaceSectionDndContextValue,
  sectionId: string,
): WorkspaceSectionMoveMode {
  return context.activeSectionId === sectionId
    ? (context.activeSectionMode ?? context.mode)
    : context.mode;
}

export function WorkspaceSectionDndBoundary<TSectionData>({
  activationEnabled,
  activeSectionId,
  activeSectionMode,
  children,
  document,
  feedbackStore,
  geometry,
  geometryIndex,
  gridOptions,
  layoutEditable,
  mode,
  onComplete,
  onMoveCommit,
  onReconciliation,
  onSelectionRequest,
  onStart,
  rootLayoutActive,
  sectionTitle,
  selectedSectionIds,
  structureEditable,
}: Readonly<{
  activationEnabled: boolean;
  activeSectionId: string | null;
  activeSectionMode: WorkspaceSectionMoveMode | null;
  children: ReactNode;
  document: WorkspaceDocument<TSectionData>;
  feedbackStore: WorkspaceSectionMoveFeedbackStore;
  geometry: WorkspaceGeometryMeasurements;
  geometryIndex: WorkspaceGeometryIndex;
  gridOptions: ResolvedWorkspaceGridOptions;
  layoutEditable: boolean;
  mode: WorkspaceSectionMoveMode;
  onComplete(canceled: boolean, announcement: string): void;
  onMoveCommit(plan: SectionMovePlan): WorkspaceActionResult;
  onReconciliation(announcement: string): void;
  onSelectionRequest(sectionId: string, request: WorkspaceSectionSelectionRequest): void;
  onStart(start: WorkspaceStructuralInteractionStart): void;
  rootLayoutActive: boolean;
  sectionTitle(sectionId: string): string;
  selectedSectionIds: readonly string[];
  structureEditable: boolean;
}>) {
  const activeSessionRef = useRef<WorkspaceSectionMoveSession<TSectionData> | null>(null);
  const pendingMoveReconciliationRef = useRef<Readonly<{
    acceptedAnnouncement: string;
    hierarchy: SectionHierarchySnapshot;
    plan: SectionMovePlan;
    rejectedAnnouncement: string;
    sectionId: string;
  }> | null>(null);
  const [reconciliationRevision, setReconciliationRevision] = useState(0);
  const rejectedStartReasonRef = useRef("");
  const handleElementsRef = useRef(new Map<string, Element>());
  const registerHandle = useCallback((sectionId: string, element: Element) => {
    handleElementsRef.current.set(sectionId, element);
  }, []);
  const unregisterHandle = useCallback((sectionId: string, element: Element) => {
    if (handleElementsRef.current.get(sectionId) === element) {
      handleElementsRef.current.delete(sectionId);
    }
  }, []);
  const restoreHandleFocus = useCallback(
    (sectionId: string) => {
      const view = geometry.canvasElement()?.ownerDocument.defaultView;
      const focus = (): boolean => {
        const element = handleElementsRef.current.get(sectionId);
        const elementView = element?.ownerDocument.defaultView;
        if (elementView && element instanceof elementView.HTMLElement && element.isConnected) {
          element.focus({ preventScroll: true });
          return true;
        }
        return false;
      };
      if (!view) {
        focus();
        return;
      }
      view.requestAnimationFrame(() => {
        focus();
        view.requestAnimationFrame(focus);
      });
    },
    [geometry],
  );
  const context = useMemo<WorkspaceSectionDndContextValue>(
    () => ({
      activationEnabled,
      activeSectionId,
      activeSectionMode,
      layoutEditable,
      mode,
      registerHandle,
      rootLayoutActive,
      structureEditable,
      unregisterHandle,
    }),
    [
      activationEnabled,
      activeSectionId,
      activeSectionMode,
      layoutEditable,
      mode,
      registerHandle,
      rootLayoutActive,
      structureEditable,
      unregisterHandle,
    ],
  );
  useEffect(() => {
    const pending = pendingMoveReconciliationRef.current;
    if (!pending) {
      return;
    }
    pendingMoveReconciliationRef.current = null;
    if (workspaceDocumentMatchesSectionMove(document, pending.hierarchy, pending.plan)) {
      restoreHandleFocus(pending.sectionId);
      onReconciliation(pending.acceptedAnnouncement);
      return;
    }
    onReconciliation(pending.rejectedAnnouncement);
  }, [document, onReconciliation, reconciliationRevision, restoreHandleFocus]);
  const createSession = useCallback(
    (event: Pick<AdapterDndEvent, "activatorPoint" | "sourceId">) => {
      const source = workspaceSectionDndSource(event.sourceId);
      return createWorkspaceSectionMoveSession({
        activeSectionId: source.sectionId,
        activatorClientPoint: event.activatorPoint,
        document,
        geometry,
        geometryIndex,
        mode,
        selectedSectionIds,
      });
    },
    [document, geometry, geometryIndex, mode, selectedSectionIds],
  );
  const handleStart = (event: AdapterDndEvent) => {
    pendingMoveReconciliationRef.current = null;
    const source = workspaceSectionDndSource(event.sourceId);
    if (event.input === "touch") {
      onSelectionRequest(source.sectionId, {
        additive: false,
        preserveSelected: selectedSectionIds.includes(source.sectionId),
      });
    }
    const start = {
      input: interactionInput(event.input),
      mode,
      root: source.root,
      sectionId: source.sectionId,
      title: sectionTitle(source.sectionId),
    } as const;
    onStart(start);
    const result = createSession(event);
    if (result.allowed) {
      activeSessionRef.current = result.session;
      rejectedStartReasonRef.current = "";
      feedbackStore.start(result.session);
    } else {
      activeSessionRef.current = null;
      rejectedStartReasonRef.current = result.reason;
      feedbackStore.rejectStart(result.reason);
    }
  };
  const handleMove = (event: AdapterDndEvent) => {
    const session = activeSessionRef.current;
    if (!session) {
      return;
    }
    const resolution = resolveWorkspaceSectionMovePreview({
      document: session.document,
      event,
      geometry,
      geometryIndex,
      gridOptions,
      session,
    });
    activeSessionRef.current = { ...session, preview: resolution.preview };
    feedbackStore.preview(resolution);
  };
  const handleComplete = (completion: AdapterDndCompletion) => {
    const source = workspaceSectionDndSource(completion.sourceId);
    const session = activeSessionRef.current;
    let announcement: string;
    if (completion.canceled) {
      announcement = `${sectionTitle(source.sectionId)} movement canceled.`;
    } else if (!session) {
      announcement = `${sectionTitle(source.sectionId)} did not move. ${rejectedStartReasonRef.current}`;
    } else {
      const resolution = resolveWorkspaceSectionMovePreview({
        document: session.document,
        event: completion,
        geometry,
        geometryIndex,
        gridOptions,
        session,
      });
      const preview = matchingWorkspaceSectionMovePreview(session.preview, resolution);
      if (preview) {
        const pendingFocus = {
          acceptedAnnouncement: workspaceSectionMoveCompletionAnnouncement(session, preview, {
            status: "applied",
          }),
          hierarchy: session.hierarchy,
          plan: preview.plan,
          rejectedAnnouncement: workspaceSectionMoveControlledRejectionAnnouncement(
            session,
            preview,
          ),
          sectionId: source.sectionId,
        } as const;
        pendingMoveReconciliationRef.current = pendingFocus;
        const result = onMoveCommit(preview.plan);
        if (result.status === "applied") {
          announcement = workspaceSectionMovePendingAnnouncement(session, preview);
          setReconciliationRevision((revision) => revision + 1);
        } else {
          announcement = workspaceSectionMoveCompletionAnnouncement(session, preview, result);
          if (pendingMoveReconciliationRef.current === pendingFocus) {
            pendingMoveReconciliationRef.current = null;
          }
        }
      } else {
        announcement = workspaceSectionMoveMismatchAnnouncement(session, resolution.reason);
      }
    }
    activeSessionRef.current = null;
    rejectedStartReasonRef.current = "";
    feedbackStore.complete();
    onComplete(completion.canceled, announcement);
    restoreHandleFocus(source.sectionId);
  };
  return (
    <WorkspaceSectionDndContext.Provider value={context}>
      <UpstreamDndBoundary
        manageAccessibility={false}
        onComplete={handleComplete}
        onMove={handleMove}
        onStart={handleStart}
        overlayClassName="setta-workspace__section-drag-overlay"
        overlayLabel={(id) => {
          const source = workspaceSectionDndSource(id);
          const activeMode = activeSectionMode ?? mode;
          const sectionCount = activeSessionRef.current?.sectionIds.length ?? 1;
          const suffix = sectionCount === 1 ? "" : ` and ${String(sectionCount - 1)} more`;
          return `${activeMode === "sort" ? "Sorting" : "Moving"} ${sectionTitle(source.sectionId)}${suffix}`;
        }}
        resolveCollisionRect={(id) => {
          const result = createSession({ activatorPoint: null, sourceId: id });
          return result.allowed ? result.session.sourceClientBounds : null;
        }}
      >
        {children}
      </UpstreamDndBoundary>
    </WorkspaceSectionDndContext.Provider>
  );
}

export function useWorkspaceSectionDnd({
  blocked,
  depth,
  sectionId,
  spatialMoving,
}: Readonly<{
  blocked: boolean;
  depth: number;
  sectionId: string;
  spatialMoving: boolean;
}>) {
  const context = useContext(WorkspaceSectionDndContext);
  const resolvedContext = context ?? DISABLED_SECTION_DND_CONTEXT;
  const structural = sectionUsesStructuralDrag(resolvedContext, depth, sectionId);
  const enabled = sectionStructuralDragEnabled(resolvedContext, blocked, sectionId, structural);
  const draggable = useUpstreamDndDraggable({
    data: { kind: "section", sectionId },
    disabled: !enabled,
    id: sourceId(sectionId, depth === 0),
  });
  const draggableHandleRef = draggable.handleRef;
  const registerHandle = resolvedContext.registerHandle;
  const unregisterHandle = resolvedContext.unregisterHandle;
  const registeredHandleRef = useRef<Element | null>(null);
  const handleRef = useCallback(
    (element: Element | null) => {
      draggableHandleRef(element);
      const previousElement = registeredHandleRef.current;
      if (previousElement && previousElement !== element) {
        unregisterHandle(sectionId, previousElement);
      }
      if (element) {
        registerHandle(sectionId, element);
      }
      registeredHandleRef.current = element;
    },
    [draggableHandleRef, registerHandle, sectionId, unregisterHandle],
  );
  if (!context) {
    throw new Error("Workspace section dragging requires its workbench interaction boundary.");
  }
  return {
    active: draggable.active,
    elementRef: draggable.elementRef,
    enabled,
    handleRef,
    mode: sectionStructuralDragMode(context, sectionId),
    spatialEnabled: context.activationEnabled || (context.rootLayoutActive && spatialMoving),
    structural,
  };
}
