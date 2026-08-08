import { ViewportPortal } from "@xyflow/react";
import { useSyncExternalStore } from "react";

import type { AdapterProofDragPreview } from "./adapter-proof-drag-planning.js";
import type { InteractionPoint, InteractionRect } from "./interaction-geometry.js";
import type { InteractionOwner } from "./interaction-owner.js";
import type { WorkspaceSectionMoveMode } from "./section-move-planning.js";
import type { AdapterDndInput } from "./upstream-dnd-adapter.js";

export type AdapterProofDragSnapshot = {
  activeInput: AdapterDndInput | null;
  activeMode: WorkspaceSectionMoveMode | null;
  activeSectionIds: readonly string[];
  commitKey: string | null;
  owner: InteractionOwner | null;
  preview: AdapterProofDragPreview | null;
  previewKey: string | null;
  previewReason: string | null;
  resolvedTargetId: string | null;
  sourceBounds: InteractionRect | null;
  transform: InteractionPoint | null;
  updateCount: number;
};

const EMPTY_DRAG_SNAPSHOT: AdapterProofDragSnapshot = {
  activeInput: null,
  activeMode: null,
  activeSectionIds: [],
  commitKey: null,
  owner: null,
  preview: null,
  previewKey: null,
  previewReason: null,
  resolvedTargetId: null,
  sourceBounds: null,
  transform: null,
  updateCount: 0,
};

export class AdapterProofDragStore {
  readonly #listeners = new Set<() => void>();
  #snapshot = EMPTY_DRAG_SNAPSHOT;

  getSnapshot = (): AdapterProofDragSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  start({
    input,
    mode,
    owner,
    sectionIds,
    sourceBounds,
  }: {
    input: AdapterDndInput;
    mode: WorkspaceSectionMoveMode;
    owner: InteractionOwner;
    sectionIds: readonly string[];
    sourceBounds: InteractionRect;
  }): void {
    this.#set({
      activeInput: input,
      activeMode: mode,
      activeSectionIds: sectionIds,
      commitKey: null,
      owner,
      preview: null,
      previewKey: null,
      previewReason: null,
      resolvedTargetId: null,
      sourceBounds,
      transform: null,
    });
  }

  preview(
    preview: AdapterProofDragPreview | null,
    details?: {
      reason: string | null;
      targetId: string | null;
      transform: InteractionPoint;
    },
  ): void {
    this.#set({
      preview,
      previewKey: preview?.destinationKey ?? null,
      previewReason: details?.reason ?? this.#snapshot.previewReason,
      resolvedTargetId: details?.targetId ?? this.#snapshot.resolvedTargetId,
      transform: details?.transform ?? this.#snapshot.transform,
    });
  }

  complete(commitKey: string | null): void {
    this.#set({
      activeInput: null,
      activeMode: null,
      activeSectionIds: [],
      commitKey,
      owner: null,
      preview: null,
      sourceBounds: null,
      transform: null,
    });
  }

  #set(update: Partial<AdapterProofDragSnapshot>): void {
    this.#snapshot = {
      ...this.#snapshot,
      ...update,
      updateCount: this.#snapshot.updateCount + 1,
    };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

export function AdapterProofDragDiagnostics({ store }: { store: AdapterProofDragStore }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const owner = diagnosticValue(snapshot.owner);
  const activeInput = diagnosticValue(snapshot.activeInput);
  const activeMode = diagnosticValue(snapshot.activeMode);
  const transform = diagnosticTransform(snapshot.transform);
  const previewKey = diagnosticValue(snapshot.previewKey);
  const previewReason = diagnosticValue(snapshot.previewReason);
  const resolvedTargetId = diagnosticValue(snapshot.resolvedTargetId);
  const commitKey = diagnosticValue(snapshot.commitKey);
  return (
    <div
      className="setta-adapter-proof__drag-diagnostics"
      data-proof-drag-update-count={snapshot.updateCount}
    >
      <p data-proof-drag-owner={owner}>Owner: {owner}</p>
      <p data-proof-drag-input={activeInput}>Input: {activeInput}</p>
      <p data-proof-drag-mode={activeMode}>Active mode: {activeMode}</p>
      <p
        data-proof-drag-transform={transform}
        data-proof-preview-key={previewKey}
        data-proof-preview-reason={previewReason}
        data-proof-resolved-target={resolvedTargetId}
      >
        Preview: {previewKey}
      </p>
      <p data-proof-commit-key={commitKey}>Commit: {commitKey}</p>
    </div>
  );
}

function diagnosticValue(value: string | null): string {
  return value ?? "none";
}

function diagnosticTransform(transform: InteractionPoint | null): string {
  return transform ? `${transform.x},${transform.y}` : "none";
}

export function AdapterProofDragPlaceholders({ store }: { store: AdapterProofDragStore }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  if (!snapshot.sourceBounds) {
    return null;
  }

  return (
    <ViewportPortal>
      <Placeholder
        className="setta-adapter-proof__drag-placeholder setta-adapter-proof__drag-placeholder--source"
        dataAttribute="source"
        rect={snapshot.sourceBounds}
      />
      {snapshot.preview ? (
        <Placeholder
          className="setta-adapter-proof__drag-placeholder setta-adapter-proof__drag-placeholder--destination"
          dataAttribute="destination"
          destinationKey={snapshot.preview.destinationKey}
          order={snapshot.preview.order}
          rect={snapshot.preview.destinationBounds}
          targetId={snapshot.preview.targetId}
        />
      ) : null}
    </ViewportPortal>
  );
}

function Placeholder({
  className,
  dataAttribute,
  destinationKey,
  order,
  rect,
  targetId,
}: {
  className: string;
  dataAttribute: "destination" | "source";
  destinationKey?: string;
  order?: readonly string[];
  rect: InteractionRect;
  targetId?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={className}
      data-proof-destination-key={destinationKey}
      data-proof-destination-order={order?.join(",")}
      data-proof-destination-target={targetId}
      data-proof-drag-placeholder={dataAttribute}
      style={{
        height: rect.height,
        transform: `translate(${rect.x}px, ${rect.y}px)`,
        width: rect.width,
      }}
    />
  );
}
