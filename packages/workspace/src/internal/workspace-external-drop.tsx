import { ViewportPortal } from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";

import type { WorkspaceDocument, WorkspaceJsonValue, WorkspacePoint } from "../core.js";
import type { WorkspaceGeometryIndex } from "./geometry-index.js";
import {
  resolveWorkspaceExternalDropCandidate,
  resolveWorkspaceExternalDropDecision,
  workspaceExternalDropDefaultLabel,
} from "./workspace-external-drop-planning.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import { WORKSPACE_NO_EXTERNAL_DROP_CLASS_NAME } from "./workspace-interaction-boundary.js";
import type {
  WorkspaceExternalDropDecision,
  WorkspaceExternalDropEventMetadata,
  WorkspaceExternalDropHandler,
  WorkspaceExternalDropRequest,
  WorkspaceExternalDropValidator,
} from "./workspace-react-contract.js";
import { captureWorkspaceSectionFreeformRegions } from "./workspace-section-move-regions.js";
import type { WorkspaceSectionRegistry } from "./workspace-section-registry.js";

type ExternalDropFeedbackState = Readonly<{
  candidate: WorkspaceExternalDropRequest["candidate"] | null;
  message: string;
  valid: boolean;
}>;

type ExternalDropCandidateResolution =
  | Readonly<{ candidate: WorkspaceExternalDropRequest["candidate"]; status: "ready" }>
  | Readonly<{ reason: string; status: "rejected" }>;

export type WorkspaceExternalDropBindings = Readonly<{
  announcementText: string;
  feedback: ReactNode;
  onDragEnd(): void;
  onDragEnter(event: ReactDragEvent<HTMLDivElement>): void;
  onDragLeave(event: ReactDragEvent<HTMLDivElement>): void;
  onDragOver(event: ReactDragEvent<HTMLDivElement>): void;
  onDrop(event: ReactDragEvent<HTMLDivElement>): void;
  resolveCandidate(position: WorkspacePoint): WorkspaceExternalDropRequest["candidate"] | null;
  state: "idle" | "invalid" | "valid";
}>;

function useGeometryRevision(index: WorkspaceGeometryIndex): number {
  const subscribe = useCallback((listener: () => void) => index.subscribe(listener), [index]);
  const snapshot = useCallback(() => index.revision, [index]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

function targetOverlay(
  feedback: ExternalDropFeedbackState,
  geometryIndex: WorkspaceGeometryIndex,
): ReactNode {
  if (!feedback.candidate) {
    return null;
  }
  const targetSectionId = feedback.candidate.parentSectionId;
  const commonProps = {
    "aria-hidden": true,
    "data-workspace-external-drop-placement": feedback.candidate.placement.type,
    "data-workspace-external-drop-target": targetSectionId ?? "canvas",
    "data-workspace-external-drop-valid": String(feedback.valid),
  } as const;
  if (targetSectionId === null) {
    return <div {...commonProps} className="setta-workspace__external-drop-target--canvas" />;
  }
  const frame = geometryIndex.get(targetSectionId);
  if (!frame) {
    return null;
  }
  return (
    <ViewportPortal>
      <div
        {...commonProps}
        className="setta-workspace__external-drop-target--section"
        style={{
          height: frame.rect.height,
          transform: `translate(${String(frame.rect.x)}px, ${String(frame.rect.y)}px)`,
          width: frame.rect.width,
        }}
      />
    </ViewportPortal>
  );
}

function WorkspaceExternalDropFeedback({
  feedback,
  geometryIndex,
}: Readonly<{
  feedback: ExternalDropFeedbackState;
  geometryIndex: WorkspaceGeometryIndex;
}>) {
  useGeometryRevision(geometryIndex);
  return (
    <>
      {targetOverlay(feedback, geometryIndex)}
      <div
        aria-hidden="true"
        className="setta-workspace__external-drop-feedback"
        data-workspace-external-drop-feedback={feedback.valid ? "valid" : "invalid"}
      >
        <strong>{feedback.valid ? "Drop allowed" : "Drop unavailable"}</strong>
        <span>{feedback.message}</span>
      </div>
    </>
  );
}

function eventUsesOptOutBoundary(event: ReactDragEvent<HTMLDivElement>): boolean {
  const ElementConstructor = event.currentTarget.ownerDocument.defaultView?.Element;
  return Boolean(
    ElementConstructor &&
    event.target instanceof ElementConstructor &&
    event.target.closest(`.${WORKSPACE_NO_EXTERNAL_DROP_CLASS_NAME}`),
  );
}

function externalDropMetadata(
  event: ReactDragEvent<HTMLDivElement>,
  phase: WorkspaceExternalDropEventMetadata["phase"],
): WorkspaceExternalDropEventMetadata {
  return Object.freeze({
    altKey: event.altKey,
    clientPosition: Object.freeze({ x: event.clientX, y: event.clientY }),
    ctrlKey: event.ctrlKey,
    dataTransferTypes: Object.freeze(Array.from(event.dataTransfer.types)),
    fileCount: event.dataTransfer.files.length,
    metaKey: event.metaKey,
    phase,
    shiftKey: event.shiftKey,
  });
}

function externalDropRequest(
  candidate: WorkspaceExternalDropRequest["candidate"],
  event: ReactDragEvent<HTMLDivElement>,
  phase: WorkspaceExternalDropEventMetadata["phase"],
  position: WorkspacePoint,
): WorkspaceExternalDropRequest {
  return Object.freeze({
    candidate,
    dataTransfer: event.dataTransfer,
    event: externalDropMetadata(event, phase),
    position: Object.freeze({ ...position }),
  });
}

function placementsMatch(
  left: WorkspaceExternalDropRequest["candidate"]["placement"],
  right: WorkspaceExternalDropRequest["candidate"]["placement"],
): boolean {
  return left.type === "ordered" && right.type === "ordered"
    ? left.index === right.index
    : left.type === "freeform" && right.type === "freeform"
      ? left.position.x === right.position.x && left.position.y === right.position.y
      : false;
}

function candidatesMatch(
  left: WorkspaceExternalDropRequest["candidate"] | null,
  right: WorkspaceExternalDropRequest["candidate"] | null,
): boolean {
  if (!left || !right) {
    return left === right;
  }
  return (
    left.parentSectionId === right.parentSectionId &&
    placementsMatch(left.placement, right.placement)
  );
}

function decisionsMatch(
  current: ExternalDropFeedbackState | null,
  next: ExternalDropFeedbackState,
): boolean {
  return (
    current !== null &&
    candidatesMatch(current.candidate, next.candidate) &&
    current.message === next.message &&
    current.valid === next.valid
  );
}

function feedbackForDecision<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  request: WorkspaceExternalDropRequest,
  decision: WorkspaceExternalDropDecision,
): ExternalDropFeedbackState {
  return Object.freeze({
    candidate: request.candidate,
    message: decision.allowed
      ? (decision.label ?? workspaceExternalDropDefaultLabel(document, request.candidate))
      : decision.reason,
    valid: decision.allowed,
  });
}

function geometryFeedback(reason: string): ExternalDropFeedbackState {
  return Object.freeze({ candidate: null, message: reason, valid: false });
}

function announcementForFeedback(feedback: ExternalDropFeedbackState | null): string {
  if (!feedback) {
    return "";
  }
  return `${feedback.valid ? "Drop allowed" : "Drop unavailable"}. ${feedback.message}`;
}

function claimExternalDrop(event: ReactDragEvent<HTMLDivElement>): void {
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "none";
}

function applyDropEffect(event: ReactDragEvent<HTMLDivElement>, allowed: boolean): void {
  event.dataTransfer.dropEffect = allowed ? "copy" : "none";
}

function dragStayedInside(event: ReactDragEvent<HTMLDivElement>): boolean {
  const NodeConstructor = event.currentTarget.ownerDocument.defaultView?.Node;
  if (NodeConstructor && event.relatedTarget instanceof NodeConstructor) {
    return event.currentTarget.contains(event.relatedTarget);
  }
  const bounds = event.currentTarget.getBoundingClientRect();
  return (
    event.clientX >= bounds.left &&
    event.clientX <= bounds.right &&
    event.clientY >= bounds.top &&
    event.clientY <= bounds.bottom
  );
}

export function useWorkspaceExternalDrop<TSectionData = WorkspaceJsonValue>({
  document,
  geometry,
  geometryIndex,
  onExternalDrop,
  registry,
  structureEditable,
  validateExternalDrop,
}: Readonly<{
  document: WorkspaceDocument<TSectionData>;
  geometry: WorkspaceGeometryMeasurements;
  geometryIndex: WorkspaceGeometryIndex;
  onExternalDrop: WorkspaceExternalDropHandler | undefined;
  registry: WorkspaceSectionRegistry<TSectionData>;
  structureEditable: boolean;
  validateExternalDrop: WorkspaceExternalDropValidator | undefined;
}>): WorkspaceExternalDropBindings {
  const activeSessionRef = useRef(false);
  const documentRef = useRef(document);
  const registryRef = useRef(registry);
  const [feedbackState, setFeedbackState] = useState<ExternalDropFeedbackState | null>(null);
  documentRef.current = document;
  registryRef.current = registry;
  const cancel = useCallback(() => {
    activeSessionRef.current = false;
    setFeedbackState(null);
  }, []);
  const measureSession = useCallback(() => {
    if (activeSessionRef.current) {
      return;
    }
    geometry.flushMeasurement();
    activeSessionRef.current = true;
  }, [geometry]);
  useEffect(
    () => () => {
      activeSessionRef.current = false;
    },
    [],
  );
  useEffect(() => {
    if (!onExternalDrop || !structureEditable) {
      cancel();
    }
  }, [cancel, onExternalDrop, structureEditable]);

  const decisionForRequest = useCallback(
    (request: WorkspaceExternalDropRequest): WorkspaceExternalDropDecision => {
      if (!structureEditable) {
        return Object.freeze({
          allowed: false,
          reason: "Dropped content cannot be added while structure editing is off.",
        });
      }
      return validateExternalDrop
        ? resolveWorkspaceExternalDropDecision(validateExternalDrop(request))
        : Object.freeze({ allowed: true });
    },
    [structureEditable, validateExternalDrop],
  );

  const resolveCandidateAt = useCallback(
    (position: WorkspacePoint, flush: boolean): ExternalDropCandidateResolution => {
      if (flush) {
        geometry.flushMeasurement();
      }
      const canvas = geometry.canvasElement();
      if (!canvas) {
        return { reason: "The workspace drop surface is unavailable.", status: "rejected" };
      }
      const currentDocument = documentRef.current;
      const regions = captureWorkspaceSectionFreeformRegions(canvas, currentDocument, {
        canvasBounds: geometry.canvasBounds(),
        viewport: geometry.currentViewport(),
      });
      if (!regions.allowed) {
        return { reason: regions.reason, status: "rejected" };
      }
      return {
        candidate: resolveWorkspaceExternalDropCandidate(
          currentDocument,
          geometryIndex,
          registryRef.current,
          position,
          regions.freeformRegions,
        ),
        status: "ready",
      };
    },
    [geometry, geometryIndex],
  );

  const resolveCandidate = useCallback(
    (position: WorkspacePoint) => {
      const resolution = resolveCandidateAt(position, true);
      return resolution.status === "ready" ? resolution.candidate : null;
    },
    [resolveCandidateAt],
  );

  const preview = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!onExternalDrop) {
        return;
      }
      if (eventUsesOptOutBoundary(event)) {
        cancel();
        return;
      }
      claimExternalDrop(event);
      measureSession();
      const position = geometry.clientPointToWorkspace({ x: event.clientX, y: event.clientY });
      const candidate = resolveCandidateAt(position, false);
      if (candidate.status === "rejected") {
        const nextFeedback = geometryFeedback(candidate.reason);
        setFeedbackState((current) =>
          decisionsMatch(current, nextFeedback) ? current : nextFeedback,
        );
        applyDropEffect(event, false);
        return;
      }
      const request = externalDropRequest(candidate.candidate, event, "preview", position);
      const decision = decisionForRequest(request);
      const nextFeedback = feedbackForDecision(document, request, decision);
      setFeedbackState((current) =>
        decisionsMatch(current, nextFeedback) ? current : nextFeedback,
      );
      applyDropEffect(event, decision.allowed);
    },
    [
      cancel,
      decisionForRequest,
      document,
      geometry,
      measureSession,
      onExternalDrop,
      resolveCandidateAt,
    ],
  );

  const onDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!onExternalDrop || eventUsesOptOutBoundary(event)) {
        cancel();
        return;
      }
      claimExternalDrop(event);
      measureSession();
      const position = geometry.clientPointToWorkspace({ x: event.clientX, y: event.clientY });
      const candidate = resolveCandidateAt(position, false);
      if (candidate.status === "rejected") {
        applyDropEffect(event, false);
        cancel();
        return;
      }
      const request = externalDropRequest(candidate.candidate, event, "drop", position);
      const decision = decisionForRequest(request);
      applyDropEffect(event, decision.allowed);
      cancel();
      if (decision.allowed) {
        void onExternalDrop(request);
      }
    },
    [cancel, decisionForRequest, geometry, measureSession, onExternalDrop, resolveCandidateAt],
  );

  const onDragLeave = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!dragStayedInside(event)) {
        cancel();
      }
    },
    [cancel],
  );

  return {
    announcementText: announcementForFeedback(feedbackState),
    feedback: feedbackState ? (
      <WorkspaceExternalDropFeedback feedback={feedbackState} geometryIndex={geometryIndex} />
    ) : null,
    onDragEnd: cancel,
    onDragEnter: preview,
    onDragLeave,
    onDragOver: preview,
    onDrop,
    resolveCandidate,
    state: feedbackState ? (feedbackState.valid ? "valid" : "invalid") : "idle",
  };
}
