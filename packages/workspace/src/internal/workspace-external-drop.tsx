import { ViewportPortal } from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";

import type { WorkspaceDocument, WorkspaceJsonValue } from "../core.js";
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
import type { WorkspaceSectionRegistry } from "./workspace-section-registry.js";

type ExternalDropFeedbackState = Readonly<{
  candidate: WorkspaceExternalDropRequest["candidate"];
  message: string;
  valid: boolean;
}>;

export type WorkspaceExternalDropBindings = Readonly<{
  announcementText: string;
  feedback: ReactNode;
  onDragEnd(): void;
  onDragEnter(event: ReactDragEvent<HTMLDivElement>): void;
  onDragLeave(event: ReactDragEvent<HTMLDivElement>): void;
  onDragOver(event: ReactDragEvent<HTMLDivElement>): void;
  onDrop(event: ReactDragEvent<HTMLDivElement>): void;
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
  const targetSectionId = feedback.candidate.parentSectionId;
  const commonProps = {
    "aria-hidden": true,
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

function externalDropRequest<TSectionData>(
  document: WorkspaceDocument<TSectionData>,
  event: ReactDragEvent<HTMLDivElement>,
  geometry: WorkspaceGeometryMeasurements,
  geometryIndex: WorkspaceGeometryIndex,
  phase: WorkspaceExternalDropEventMetadata["phase"],
  registry: WorkspaceSectionRegistry<TSectionData>,
): WorkspaceExternalDropRequest {
  geometry.flushMeasurement();
  const position = Object.freeze(
    geometry.clientPointToWorkspace({ x: event.clientX, y: event.clientY }),
  );
  return Object.freeze({
    candidate: resolveWorkspaceExternalDropCandidate(document, geometryIndex, registry, position),
    dataTransfer: event.dataTransfer,
    event: externalDropMetadata(event, phase),
    position,
  });
}

function decisionsMatch(
  current: ExternalDropFeedbackState | null,
  next: ExternalDropFeedbackState,
): boolean {
  return (
    current?.candidate.parentSectionId === next.candidate.parentSectionId &&
    current.candidate.insertionIndex === next.candidate.insertionIndex &&
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
  const [feedbackState, setFeedbackState] = useState<ExternalDropFeedbackState | null>(null);
  const cancel = useCallback(() => setFeedbackState(null), []);
  useEffect(() => cancel, [cancel]);
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
      const request = externalDropRequest(
        document,
        event,
        geometry,
        geometryIndex,
        "preview",
        registry,
      );
      const decision = decisionForRequest(request);
      const nextFeedback = feedbackForDecision(document, request, decision);
      setFeedbackState((current) =>
        decisionsMatch(current, nextFeedback) ? current : nextFeedback,
      );
      applyDropEffect(event, decision.allowed);
    },
    [cancel, decisionForRequest, document, geometry, geometryIndex, onExternalDrop, registry],
  );

  const onDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!onExternalDrop || eventUsesOptOutBoundary(event)) {
        cancel();
        return;
      }
      claimExternalDrop(event);
      const request = externalDropRequest(
        document,
        event,
        geometry,
        geometryIndex,
        "drop",
        registry,
      );
      const decision = decisionForRequest(request);
      applyDropEffect(event, decision.allowed);
      cancel();
      if (decision.allowed) {
        void onExternalDrop(request);
      }
    },
    [cancel, decisionForRequest, document, geometry, geometryIndex, onExternalDrop, registry],
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
    state: feedbackState ? (feedbackState.valid ? "valid" : "invalid") : "idle",
  };
}
