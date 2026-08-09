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
import type {
  SectionMovePlan,
  WorkspaceSectionMoveMode,
  WorkspaceSectionMoveValidator,
} from "./section-move-planning.js";
import {
  UpstreamDndBoundary,
  useUpstreamDndDraggable,
  type AdapterDndCompletion,
  type AdapterDndEvent,
} from "./upstream-dnd-adapter.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import type { WorkspaceStructuralInteractionStart } from "./workspace-interaction-owner.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import {
  workspaceSectionMoveCompletionAnnouncement,
  workspaceSectionMoveControlledRejectionAnnouncement,
  workspaceSectionMoveMismatchAnnouncement,
  workspaceSectionMovePendingAnnouncement,
} from "./workspace-section-move-announcements.js";
import { workspaceDocumentMatchesSectionMove } from "./workspace-section-move-command.js";
import type { WorkspaceSectionMoveFeedbackStore } from "./workspace-section-move-feedback.js";
import { WorkspaceSectionMoveProjection } from "./workspace-section-move-projection.js";
import {
  createWorkspaceSectionMoveSession,
  matchingWorkspaceSectionMovePreview,
  resolveWorkspaceSectionKeyboardMovePreview,
  resolveWorkspaceSectionMovePreview,
  revalidateWorkspaceSectionKeyboardMovePreview,
  type WorkspaceSectionMoveSession,
  type WorkspaceSectionMoveSessionResult,
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
  registerFrame(sectionId: string, element: HTMLElement): void;
  registerHandle(sectionId: string, element: Element): void;
  rootLayoutActive: boolean;
  structureEditable: boolean;
  unregisterFrame(sectionId: string, element: HTMLElement): void;
  unregisterHandle(sectionId: string, element: Element): void;
}>;

const WorkspaceSectionDndContext = createContext<WorkspaceSectionDndContextValue | null>(null);
const DISABLED_SECTION_DND_CONTEXT: WorkspaceSectionDndContextValue = {
  activationEnabled: false,
  activeSectionId: null,
  activeSectionMode: null,
  layoutEditable: false,
  mode: "sort",
  registerFrame: () => undefined,
  registerHandle: () => undefined,
  rootLayoutActive: false,
  structureEditable: false,
  unregisterFrame: () => undefined,
  unregisterHandle: () => undefined,
};

export function workspaceSectionMoveDescription({
  detached,
  freeformChild,
  locked,
  mode,
  selectionMovementBlocked,
  structural,
}: Readonly<{
  detached: boolean;
  freeformChild: boolean;
  locked: boolean;
  mode: WorkspaceSectionMoveMode;
  selectionMovementBlocked: boolean;
  structural: boolean;
}>): string {
  if (detached) {
    return "Movement unavailable while this section is open in another window. Redock it before moving or nesting it.";
  }
  if (locked) {
    return "Movement unavailable because this section is locked.";
  }
  if (selectionMovementBlocked) {
    return "Movement unavailable because every selected root must be unlocked and docked.";
  }
  if (!structural) {
    return "Drag to move. Use the arrow keys for keyboard movement.";
  }
  if (freeformChild && mode === "sort") {
    return "Positioning keeps this section in its current freeform parent. Press Enter or Space to start keyboard movement.";
  }
  const effect =
    mode === "sort"
      ? "Sorting keeps this section in its current parent."
      : "Free move can change this section's parent.";
  return `${effect} Press Enter or Space to start keyboard movement.`;
}

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
  freeformChild: boolean,
  sectionId: string,
  structural: boolean,
): boolean {
  if (blocked || !structural) {
    return false;
  }
  return (
    context.activeSectionId === sectionId ||
    (context.activationEnabled &&
      context.layoutEditable &&
      (context.structureEditable || (freeformChild && context.mode === "sort")))
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

function sessionUsesLocalFreeformMovement(session: WorkspaceSectionMoveSession | null): boolean {
  const parentId = session?.sourceParentIds[0] ?? null;
  return Boolean(
    session &&
    parentId &&
    session.sourceParentIds.every((candidate) => candidate === parentId) &&
    session.document.sections[parentId]?.childLayout?.positioning === "freeform",
  );
}

function sectionHasFreeformParent<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  sectionId: string,
): boolean {
  return Object.values(document.sections).some(
    (section) =>
      section.childLayout?.positioning === "freeform" &&
      section.childLayout.sectionIds.includes(sectionId),
  );
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
  validateSectionMove,
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
  validateSectionMove: WorkspaceSectionMoveValidator<TSectionData> | undefined;
}>) {
  const activeSessionRef = useRef<WorkspaceSectionMoveSession<TSectionData> | null>(null);
  const preparedSessionRef = useRef<Readonly<{
    result: WorkspaceSectionMoveSessionResult<TSectionData>;
    sourceId: string;
  }> | null>(null);
  const pendingMoveReconciliationRef = useRef<Readonly<{
    acceptedAnnouncement: string;
    plan: SectionMovePlan;
    rejectedAnnouncement: string;
    sectionId: string;
    sourceDocument: WorkspaceDocument<TSectionData>;
  }> | null>(null);
  const [reconciliationRevision, setReconciliationRevision] = useState(0);
  const rejectedStartReasonRef = useRef("");
  const sectionMoveProjection = useMemo(() => new WorkspaceSectionMoveProjection(), []);
  const handleElementsRef = useRef(new Map<string, Element>());
  const registerFrame = useCallback(
    (sectionId: string, element: HTMLElement) => sectionMoveProjection.register(sectionId, element),
    [sectionMoveProjection],
  );
  const unregisterFrame = useCallback(
    (sectionId: string, element: HTMLElement) =>
      sectionMoveProjection.unregister(sectionId, element),
    [sectionMoveProjection],
  );
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
      registerFrame,
      registerHandle,
      rootLayoutActive,
      structureEditable,
      unregisterFrame,
      unregisterHandle,
    }),
    [
      activationEnabled,
      activeSectionId,
      activeSectionMode,
      layoutEditable,
      mode,
      registerFrame,
      registerHandle,
      rootLayoutActive,
      structureEditable,
      unregisterFrame,
      unregisterHandle,
    ],
  );
  useEffect(() => () => sectionMoveProjection.clear(), [sectionMoveProjection]);
  useEffect(() => {
    const pending = pendingMoveReconciliationRef.current;
    if (!pending) {
      return;
    }
    pendingMoveReconciliationRef.current = null;
    if (workspaceDocumentMatchesSectionMove(document, pending.sourceDocument, pending.plan)) {
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
    sectionMoveProjection.clear();
    const source = workspaceSectionDndSource(event.sourceId);
    if (event.input === "touch") {
      onSelectionRequest(source.sectionId, {
        additive: false,
        preserveSelected: selectedSectionIds.includes(source.sectionId),
      });
    }
    const prepared = preparedSessionRef.current;
    preparedSessionRef.current = null;
    const result = prepared?.sourceId === event.sourceId ? prepared.result : createSession(event);
    const localLayout =
      mode === "sort" &&
      (sectionHasFreeformParent(document, source.sectionId) ||
        (result.allowed && sessionUsesLocalFreeformMovement(result.session)));
    const start = {
      input: interactionInput(event.input),
      localLayout,
      mode,
      root: source.root,
      sectionId: source.sectionId,
      title: sectionTitle(source.sectionId),
    } as const;
    onStart(start);
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
    if (!session || (event.input === "keyboard" && !event.keyboardDirection)) {
      return;
    }
    const resolution = event.keyboardDirection
      ? resolveWorkspaceSectionKeyboardMovePreview({
          direction: event.keyboardDirection,
          document: session.document,
          geometry,
          gridOptions,
          session,
          validateSectionMove,
        })
      : resolveWorkspaceSectionMovePreview({
          document: session.document,
          event,
          geometry,
          gridOptions,
          session,
          validateSectionMove,
        });
    activeSessionRef.current = {
      ...session,
      collisionState: resolution.collisionState,
      preview: resolution.preview,
    };
    sectionMoveProjection.preview(resolution.preview?.transformsById ?? {});
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
      const resolution =
        completion.input === "keyboard"
          ? revalidateWorkspaceSectionKeyboardMovePreview({ session, validateSectionMove })
          : resolveWorkspaceSectionMovePreview({
              document: session.document,
              event: completion,
              geometry,
              gridOptions,
              session,
              validateSectionMove,
            });
      const preview = matchingWorkspaceSectionMovePreview(session.preview, resolution);
      if (preview) {
        const pendingFocus = {
          acceptedAnnouncement: workspaceSectionMoveCompletionAnnouncement(session, preview, {
            status: "applied",
          }),
          plan: preview.plan,
          rejectedAnnouncement: workspaceSectionMoveControlledRejectionAnnouncement(
            session,
            preview,
          ),
          sectionId: source.sectionId,
          sourceDocument: session.document,
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
    preparedSessionRef.current = null;
    rejectedStartReasonRef.current = "";
    sectionMoveProjection.clear();
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
          const localLayout = sessionUsesLocalFreeformMovement(activeSessionRef.current);
          const sectionCount = activeSessionRef.current?.sectionIds.length ?? 1;
          const suffix = sectionCount === 1 ? "" : ` and ${String(sectionCount - 1)} more`;
          const verb = localLayout ? "Positioning" : activeMode === "sort" ? "Sorting" : "Moving";
          return `${verb} ${sectionTitle(source.sectionId)}${suffix}`;
        }}
        resolveCollisionRect={(id, activatorPoint) => {
          const result = createSession({ activatorPoint, sourceId: id });
          preparedSessionRef.current = { result, sourceId: id };
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
  freeformChild,
  sectionId,
  spatialMoving,
}: Readonly<{
  blocked: boolean;
  depth: number;
  freeformChild: boolean;
  sectionId: string;
  spatialMoving: boolean;
}>) {
  const context = useContext(WorkspaceSectionDndContext);
  const resolvedContext = context ?? DISABLED_SECTION_DND_CONTEXT;
  const structural = sectionUsesStructuralDrag(resolvedContext, depth, sectionId);
  const enabled = sectionStructuralDragEnabled(
    resolvedContext,
    blocked,
    freeformChild,
    sectionId,
    structural,
  );
  const draggable = useUpstreamDndDraggable({
    data: { kind: "section", sectionId },
    disabled: !enabled,
    id: sourceId(sectionId, depth === 0),
  });
  const draggableElementRef = draggable.elementRef;
  const draggableHandleRef = draggable.handleRef;
  const registerFrame = resolvedContext.registerFrame;
  const registerHandle = resolvedContext.registerHandle;
  const unregisterFrame = resolvedContext.unregisterFrame;
  const unregisterHandle = resolvedContext.unregisterHandle;
  const registeredFrameRef = useRef<HTMLElement | null>(null);
  const registeredHandleRef = useRef<Element | null>(null);
  const elementRef = useCallback(
    (element: HTMLElement | null) => {
      draggableElementRef(element);
      const previousElement = registeredFrameRef.current;
      if (previousElement && previousElement !== element) {
        unregisterFrame(sectionId, previousElement);
      }
      if (element) {
        registerFrame(sectionId, element);
      }
      registeredFrameRef.current = element;
    },
    [draggableElementRef, registerFrame, sectionId, unregisterFrame],
  );
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
    elementRef,
    enabled,
    handleRef,
    mode: sectionStructuralDragMode(context, sectionId),
    spatialEnabled: context.activationEnabled || (context.rootLayoutActive && spatialMoving),
    structural,
  };
}
