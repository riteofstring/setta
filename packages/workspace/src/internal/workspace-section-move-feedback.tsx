import { ViewportPortal } from "@xyflow/react";
import { useSyncExternalStore } from "react";

import type { WorkspaceRect } from "./geometry-index.js";
import type {
  WorkspaceSectionMovePreview,
  WorkspaceSectionMovePreviewResolution,
  WorkspaceSectionMoveSession,
} from "./workspace-section-move-session.js";

type WorkspaceSectionMoveFeedbackSnapshot = Readonly<{
  active: boolean;
  invalidIndicator: WorkspaceSectionMovePreviewResolution["invalidIndicator"] | null;
  preview: WorkspaceSectionMovePreview | null;
  reason: string;
  sourceBounds: WorkspaceRect | null;
}>;

const EMPTY_FEEDBACK_SNAPSHOT: WorkspaceSectionMoveFeedbackSnapshot = {
  active: false,
  invalidIndicator: null,
  preview: null,
  reason: "",
  sourceBounds: null,
};

export class WorkspaceSectionMoveFeedbackStore {
  readonly #listeners = new Set<() => void>();
  #snapshot = EMPTY_FEEDBACK_SNAPSHOT;

  getSnapshot = (): WorkspaceSectionMoveFeedbackSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  start(session: WorkspaceSectionMoveSession): void {
    this.#set({
      active: true,
      invalidIndicator: null,
      preview: null,
      reason: "",
      sourceBounds: session.sourceWorkspaceBounds,
    });
  }

  rejectStart(reason: string): void {
    this.#set({
      active: true,
      invalidIndicator: null,
      preview: null,
      reason,
      sourceBounds: null,
    });
  }

  preview(resolution: WorkspaceSectionMovePreviewResolution): void {
    this.#set({
      invalidIndicator: resolution.invalidIndicator ?? null,
      preview: resolution.preview,
      reason: resolution.reason,
    });
  }

  complete(): void {
    this.#set({
      active: false,
      invalidIndicator: null,
      preview: null,
      reason: "",
      sourceBounds: null,
    });
  }

  #set(update: Partial<WorkspaceSectionMoveFeedbackSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...update };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

function Placeholder({
  kind,
  rect,
  state,
}: Readonly<{
  kind: "canvas" | "empty" | "horizontal" | "source" | "vertical";
  rect: WorkspaceRect;
  state: "destination" | "invalid" | "source";
}>) {
  return (
    <div
      aria-hidden="true"
      className={`setta-workspace__section-move-placeholder setta-workspace__section-move-placeholder--${kind}`}
      data-workspace-section-move-placeholder={state}
      style={{
        height: rect.height,
        transform: `translate(${String(rect.x)}px, ${String(rect.y)}px)`,
        width: rect.width,
      }}
    />
  );
}

function sourceIsProjected(preview: WorkspaceSectionMovePreview | null): boolean {
  return preview
    ? preview.plan.sectionIds.some((sectionId) => Object.hasOwn(preview.transformsById, sectionId))
    : false;
}

function WorkspaceSectionMoveRejection({
  active,
  reason,
}: Readonly<{ active: boolean; reason: string }>) {
  if (!active || !reason) {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      className="setta-workspace__section-move-feedback"
      data-workspace-section-move-feedback="invalid"
    >
      <strong>Move unavailable</strong>
      <span>{reason}</span>
    </div>
  );
}

export function WorkspaceSectionMoveFeedback({
  store,
}: Readonly<{ store: WorkspaceSectionMoveFeedbackStore }>) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const announcement = snapshot.preview?.announcement ?? snapshot.reason;
  const sourceProjected = sourceIsProjected(snapshot.preview);
  return (
    <>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-section-move-preview-announcement=""
      >
        {snapshot.active ? announcement : ""}
      </div>
      {snapshot.sourceBounds ? (
        <ViewportPortal>
          {sourceProjected ? null : (
            <Placeholder kind="source" rect={snapshot.sourceBounds} state="source" />
          )}
          {snapshot.preview ? (
            <div
              data-workspace-section-move-destination-index={snapshot.preview.plan.destinationIndex}
              data-workspace-section-move-destination-key={snapshot.preview.destinationKey}
              data-workspace-section-move-destination-parent={
                snapshot.preview.plan.destinationParentId ?? "canvas"
              }
            >
              <Placeholder
                kind={snapshot.preview.indicator.kind}
                rect={snapshot.preview.indicator.rect}
                state="destination"
              />
            </div>
          ) : null}
          {snapshot.invalidIndicator ? (
            <Placeholder
              kind={snapshot.invalidIndicator.kind}
              rect={snapshot.invalidIndicator.rect}
              state="invalid"
            />
          ) : null}
        </ViewportPortal>
      ) : null}
      <WorkspaceSectionMoveRejection active={snapshot.active} reason={snapshot.reason} />
    </>
  );
}
