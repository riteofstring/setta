import { Panel, ViewportPortal, useReactFlow, useViewport, type Viewport } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  ADAPTER_PROOF_CANVAS_TARGET_ID,
  type AdapterProofDragPreview,
  type AdapterProofDragSession,
} from "./adapter-proof-drag-planning.js";
import { adapterProofOrientation } from "./adapter-proof-model.js";
import {
  clientPointToWorkspace,
  clientRectToWorkspace,
  resolveGeometryDropTarget,
  workspaceRectToClient,
  type GeometryRegistration,
  type MarqueeSelectionMode,
  type MeasuredWorkspaceFrame,
  type WorkspaceGeometryIndex,
  type WorkspacePoint,
  type WorkspaceRect,
} from "./geometry-index.js";
import {
  createInteractionRect,
  type InteractionRect,
  type ViewportTransform,
} from "./interaction-geometry.js";
import type { SectionMoveMode } from "./section-move-planning.js";
import type { AdapterDndEvent } from "./upstream-dnd-adapter.js";

type SelectionChangeSource = "control" | "marquee";

type MeasuredElement = Omit<MeasuredWorkspaceFrame, "rect"> & {
  element: HTMLElement;
};

type RegisteredMeasuredElement = MeasuredElement & {
  frame: MeasuredWorkspaceFrame | null;
  registration: GeometryRegistration | null;
  token: symbol;
};

const SAME_FRAME_TOLERANCE = 0.01;

export type ActiveAdapterProofDrag = AdapterProofDragSession & {
  input: AdapterDndEvent["input"];
  preview: AdapterProofDragPreview | null;
};

export class AdapterProofGeometryMeasurements {
  readonly #entries = new Map<string, RegisteredMeasuredElement>();
  readonly #geometryIndex: WorkspaceGeometryIndex;
  #canvasElement: HTMLElement | null = null;
  #frameRequest: number | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #viewport: ViewportTransform = { x: 0, y: 0, zoom: 1 };

  constructor(geometryIndex: WorkspaceGeometryIndex) {
    this.#geometryIndex = geometryIndex;
  }

  register(measuredElement: MeasuredElement): () => void {
    if (this.#entries.has(measuredElement.sectionId)) {
      throw new Error(`Section ${measuredElement.sectionId} already has measured DOM geometry.`);
    }
    const entry: RegisteredMeasuredElement = {
      ...measuredElement,
      frame: null,
      registration: null,
      token: Symbol(measuredElement.sectionId),
    };
    this.#entries.set(entry.sectionId, entry);
    this.#requireResizeObserver().observe(entry.element);
    this.#measure(entry);

    return () => {
      if (this.#entries.get(entry.sectionId)?.token !== entry.token) {
        return;
      }
      this.#resizeObserver?.unobserve(entry.element);
      entry.registration?.dispose();
      this.#entries.delete(entry.sectionId);
    };
  }

  setCanvasElement(element: HTMLElement | null): void {
    if (this.#canvasElement === element) {
      return;
    }
    this.#canvasElement?.removeEventListener("scroll", this.#onScroll, true);
    window.removeEventListener("resize", this.#onResize);
    this.#cancelScheduledMeasurement();
    this.#canvasElement = element;
    element?.addEventListener("scroll", this.#onScroll, true);
    if (element) {
      window.addEventListener("resize", this.#onResize);
      this.#measureAll();
    }
  }

  setViewport(viewport: ViewportTransform): void {
    this.#viewport = { ...viewport };
    this.requestMeasurement();
  }

  requestMeasurement(): void {
    if (this.#frameRequest !== null || !this.#canvasElement) {
      return;
    }
    this.#frameRequest = requestAnimationFrame(() => {
      this.#frameRequest = null;
      this.#measureAll();
    });
  }

  flushMeasurement(): void {
    this.#cancelScheduledMeasurement();
    this.#measureAll();
  }

  #cancelScheduledMeasurement(): void {
    if (this.#frameRequest !== null) {
      cancelAnimationFrame(this.#frameRequest);
      this.#frameRequest = null;
    }
  }

  #measureAll(): void {
    for (const entry of this.#entries.values()) {
      this.#measure(entry);
    }
  }

  #measure(entry: RegisteredMeasuredElement): void {
    if (!this.#canvasElement) {
      return;
    }
    const frame: MeasuredWorkspaceFrame = {
      depth: entry.depth,
      order: entry.order,
      parentSectionId: entry.parentSectionId,
      rect: clientRectToWorkspace(
        domRect(entry.element.getBoundingClientRect()),
        domRect(this.#canvasElement.getBoundingClientRect()),
        this.#viewport,
      ),
      sectionId: entry.sectionId,
    };
    if (entry.frame && measuredFramesMatch(entry.frame, frame)) {
      return;
    }
    if (entry.registration) {
      entry.registration.update(frame);
    } else {
      entry.registration = this.#geometryIndex.register(frame);
    }
    entry.frame = frame;
  }

  #requireResizeObserver(): ResizeObserver {
    this.#resizeObserver ??= new ResizeObserver(() => this.requestMeasurement());
    return this.#resizeObserver;
  }

  readonly #onResize = () => this.requestMeasurement();
  readonly #onScroll = () => this.requestMeasurement();
}

export function resolveAdapterProofPointerTarget(
  event: AdapterDndEvent,
  session: ActiveAdapterProofDrag,
  canvasElement: HTMLElement | null,
  geometryIndex: WorkspaceGeometryIndex,
  viewport: ViewportTransform,
): string | null {
  if (!canvasElement) {
    return event.targetId;
  }
  if (event.input === "keyboard") {
    return resolveKeyboardTarget(event, session) ?? event.targetId;
  }
  const interactionPoint = interactionPointForDrag(event, session);
  const viewportBounds = interactionRect(canvasElement.getBoundingClientRect());
  const target = resolveGeometryDropTarget(
    geometryIndex,
    interactionPoint,
    viewportBounds,
    viewport,
    new Set(session.sectionIds),
  );
  if (target.targetSectionId) {
    return target.targetSectionId;
  }
  const insideCanvas =
    interactionPoint.x >= viewportBounds.x &&
    interactionPoint.x <= viewportBounds.right &&
    interactionPoint.y >= viewportBounds.y &&
    interactionPoint.y <= viewportBounds.bottom;
  return insideCanvas ? ADAPTER_PROOF_CANVAS_TARGET_ID : null;
}

export function refreshAdapterProofTargetClientRect(
  session: ActiveAdapterProofDrag,
  targetId: string | null,
  canvasElement: HTMLElement | null,
  geometryIndex: WorkspaceGeometryIndex,
  viewport: ViewportTransform,
): ActiveAdapterProofDrag {
  if (!canvasElement || !targetId || targetId === ADAPTER_PROOF_CANVAS_TARGET_ID) {
    return session;
  }
  const targetFrame = geometryIndex.get(targetId);
  if (!targetFrame) {
    return session;
  }
  const viewportBounds = interactionRect(canvasElement.getBoundingClientRect());
  return {
    ...session,
    clientRectsById: {
      ...session.clientRectsById,
      [targetId]: interactionRect(
        workspaceRectToClient(targetFrame.rect, viewportBounds, viewport),
      ),
    },
  };
}

function interactionPointForDrag(
  event: AdapterDndEvent,
  session: ActiveAdapterProofDrag,
): { x: number; y: number } {
  const base = session.activatorPoint ?? {
    x: session.sourceClientBounds.x + session.sourceClientBounds.width / 2,
    y: session.sourceClientBounds.y + session.sourceClientBounds.height / 2,
  };
  return { x: base.x + event.transform.x, y: base.y + event.transform.y };
}

function resolveKeyboardTarget(
  event: AdapterDndEvent,
  session: ActiveAdapterProofDrag,
): string | null {
  const sourceId = session.sectionIds[0];
  if (!sourceId) {
    return null;
  }
  const { parentId, siblings } = keyboardSiblingContext(session, sourceId);
  const selected = new Set(session.sectionIds);
  const selectedIndexes = session.sectionIds.map((sectionId) => siblings.indexOf(sectionId));
  const delta =
    adapterProofOrientation(parentId) === "horizontal" ? event.transform.x : event.transform.y;
  if (delta > 0) {
    const lastIndex = Math.max(...selectedIndexes);
    return siblings.slice(lastIndex + 1).find((sectionId) => !selected.has(sectionId)) ?? null;
  }
  if (delta < 0) {
    const firstIndex = Math.min(...selectedIndexes);
    return (
      siblings
        .slice(0, firstIndex)
        .reverse()
        .find((sectionId) => !selected.has(sectionId)) ?? null
    );
  }
  return null;
}

function keyboardSiblingContext(
  session: ActiveAdapterProofDrag,
  sourceId: string,
): { parentId: string | null; siblings: readonly string[] } {
  const parentId = session.hierarchy.parentByChild[sourceId] ?? null;
  const siblings = parentId
    ? (session.hierarchy.childrenByParent[parentId] ?? [])
    : session.hierarchy.rootSectionIds;
  return { parentId, siblings };
}

function interactionRect({ x, y, width, height }: WorkspaceRect): InteractionRect {
  return createInteractionRect(x, y, width, height);
}

export type AdapterProofCanvasControlsProps = {
  canvasElement: HTMLElement | null;
  dragMode: SectionMoveMode;
  geometryIndex: WorkspaceGeometryIndex;
  marqueeMode: MarqueeSelectionMode;
  selectedSectionIds: ReadonlySet<string>;
  onDragModeChange(mode: SectionMoveMode): void;
  onMarqueeModeChange(mode: MarqueeSelectionMode): void;
  onSelectionChange(sectionIds: readonly string[], source: SelectionChangeSource): void;
};

function useAdapterProofGeometryRevision(index: WorkspaceGeometryIndex): number {
  const subscribe = useCallback((listener: () => void) => index.subscribe(listener), [index]);
  const getSnapshot = useCallback(() => index.revision, [index]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function AdapterProofGeometryCount({
  geometryIndex,
}: {
  geometryIndex: WorkspaceGeometryIndex;
}) {
  useAdapterProofGeometryRevision(geometryIndex);
  return (
    <p data-proof-geometry-count="" data-proof-geometry-revision={geometryIndex.revision}>
      Frames: {geometryIndex.size}
    </p>
  );
}

export function AdapterProofCanvasControls({
  canvasElement,
  dragMode,
  geometryIndex,
  marqueeMode,
  onDragModeChange,
  onMarqueeModeChange,
  onSelectionChange,
  selectedSectionIds,
}: AdapterProofCanvasControlsProps) {
  const instance = useReactFlow();
  const viewport = useViewport();
  useAdapterProofGeometryRevision(geometryIndex);
  const selectionRoots = measuredSelectionRoots(geometryIndex, selectedSectionIds);
  const primarySectionId = selectionRoots[0] ?? null;
  const selectedFrame = primarySectionId ? geometryIndex.get(primarySectionId) : undefined;
  const selectedBounds = geometryIndex.boundsWhenReady(selectionRoots);

  const focusSelected = () => {
    if (!canvasElement || !selectedFrame || !primarySectionId) {
      return;
    }
    const bounds = canvasElement.getBoundingClientRect();
    const centerX = selectedFrame.rect.x + selectedFrame.rect.width / 2;
    const centerY = selectedFrame.rect.y + selectedFrame.rect.height / 2;
    const nextViewport = {
      x: bounds.width / 2 - centerX * viewport.zoom,
      y: bounds.height / 2 - centerY * viewport.zoom,
      zoom: viewport.zoom,
    };
    void instance.setViewport(nextViewport, { duration: 0 }).then(() => {
      const sectionElement = canvasElement.querySelector<HTMLElement>(
        `[data-proof-section-id="${primarySectionId}"]`,
      );
      const selectionControl = sectionElement?.querySelector<HTMLElement>(
        ":scope > .setta-adapter-proof__nested-header > button:not(:disabled)",
      );
      (selectionControl ?? sectionElement)?.focus({ preventScroll: true });
    });
  };

  return (
    <Panel position="top-right">
      <div
        aria-label="Adapter proof controls"
        className="setta-adapter-proof__controls"
        role="group"
      >
        <button disabled={!selectedFrame} onClick={focusSelected} type="button">
          Focus selected
        </button>
        <button
          disabled={!selectedBounds}
          onClick={() => {
            if (selectedBounds) {
              void instance.fitBounds(selectedBounds, { duration: 0, padding: 0.2 });
            }
          }}
          type="button"
        >
          Fit selection
        </button>
        <button
          onClick={() => onSelectionChange(["nested-note-b", "nested-note-c"], "control")}
          type="button"
        >
          Select deep notes
        </button>
        <button
          onClick={() => onSelectionChange(["nested-note-a", "nested-container"], "control")}
          type="button"
        >
          Select sibling block
        </button>
        <button
          disabled={selectedSectionIds.size === 0}
          onClick={() => onSelectionChange([], "control")}
          type="button"
        >
          Clear selection
        </button>
        <button
          aria-pressed={dragMode === "free"}
          data-proof-mode-control=""
          onClick={() => onDragModeChange(dragMode === "sort" ? "free" : "sort")}
          type="button"
        >
          Move mode: {dragMode}
        </button>
        <button
          aria-pressed={marqueeMode === "full"}
          onClick={() => onMarqueeModeChange(marqueeMode === "full" ? "partial" : "full")}
          type="button"
        >
          Marquee: {marqueeMode}
        </button>
        {[0.5, 1, 2].map((zoom) => (
          <button
            aria-label={`Set zoom to ${String(zoom * 100)}%`}
            aria-pressed={Math.abs(viewport.zoom - zoom) < 0.001}
            key={zoom}
            onClick={() => void instance.zoomTo(zoom, { duration: 0 })}
            type="button"
          >
            {String(zoom * 100)}%
          </button>
        ))}
      </div>
    </Panel>
  );
}

export function AdapterProofSelectedFrameOverlay({
  geometryIndex,
  selectedSectionIds,
}: Pick<AdapterProofCanvasControlsProps, "geometryIndex" | "selectedSectionIds">) {
  useAdapterProofGeometryRevision(geometryIndex);
  const selectionRoots = measuredSelectionRoots(geometryIndex, selectedSectionIds);
  const bounds = geometryIndex.boundsWhenReady(selectionRoots);
  if (!bounds) {
    return null;
  }

  return (
    <ViewportPortal>
      <div
        aria-hidden="true"
        className="setta-adapter-proof__selection-overlay"
        data-proof-selection-roots={selectionRoots.join(",")}
        style={{
          height: bounds.height,
          transform: `translate(${bounds.x}px, ${bounds.y}px)`,
          width: bounds.width,
        }}
      />
    </ViewportPortal>
  );
}

export function AdapterProofInitialGeometryFit({
  geometryIndex,
  onReady,
  sectionIds,
}: {
  geometryIndex: WorkspaceGeometryIndex;
  onReady(): void;
  sectionIds: readonly string[];
}) {
  const instance = useReactFlow();
  const revision = useAdapterProofGeometryRevision(geometryIndex);
  const didFit = useRef(false);

  useEffect(() => {
    const bounds = geometryIndex.boundsWhenReady(sectionIds);
    if (didFit.current || !bounds) {
      return;
    }
    didFit.current = true;
    void instance.fitBounds(bounds, { duration: 0, padding: 0.08 }).then(onReady);
  }, [geometryIndex, instance, onReady, revision, sectionIds]);

  return null;
}

export function AdapterProofMarqueeSelection({
  canvasElement,
  geometryIndex,
  marqueeMode,
  onSelectionChange,
}: Pick<
  AdapterProofCanvasControlsProps,
  "canvasElement" | "geometryIndex" | "marqueeMode" | "onSelectionChange"
>) {
  const viewport = useViewport();
  const [rect, setRect] = useState<WorkspaceRect | null>(null);

  useEffect(() => {
    if (!canvasElement) {
      return;
    }
    let activePointerId: number | null = null;
    let startPoint: WorkspacePoint | null = null;

    const toWorkspacePoint = (event: PointerEvent): WorkspacePoint =>
      clientPointToWorkspace(
        { x: event.clientX, y: event.clientY },
        domRect(canvasElement.getBoundingClientRect()),
        viewport,
      );
    const stopOwnedEvent = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    const releasePointer = (pointerId: number) => {
      if (canvasElement.hasPointerCapture(pointerId)) {
        canvasElement.releasePointerCapture(pointerId);
      }
      activePointerId = null;
      startPoint = null;
      setRect(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (
        !event.isPrimary ||
        event.button !== 0 ||
        !event.shiftKey ||
        isInteractiveMarqueeTarget(event.target)
      ) {
        return;
      }
      stopOwnedEvent(event);
      activePointerId = event.pointerId;
      startPoint = toWorkspacePoint(event);
      canvasElement.setPointerCapture(event.pointerId);
      setRect(marqueeRect(startPoint, startPoint));
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId || !startPoint) {
        return;
      }
      stopOwnedEvent(event);
      setRect(marqueeRect(startPoint, toWorkspacePoint(event)));
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== activePointerId || !startPoint) {
        return;
      }
      stopOwnedEvent(event);
      const completedRect = marqueeRect(startPoint, toWorkspacePoint(event));
      const selectedIds = geometryIndex
        .framesInRect(completedRect, marqueeMode)
        .map(({ sectionId }) => sectionId);
      onSelectionChange(selectedIds, "marquee");
      releasePointer(event.pointerId);
    };
    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId === activePointerId) {
        stopOwnedEvent(event);
        releasePointer(event.pointerId);
      }
    };

    canvasElement.addEventListener("pointerdown", onPointerDown, true);
    canvasElement.addEventListener("pointermove", onPointerMove, true);
    canvasElement.addEventListener("pointerup", onPointerUp, true);
    canvasElement.addEventListener("pointercancel", onPointerCancel, true);
    return () => {
      canvasElement.removeEventListener("pointerdown", onPointerDown, true);
      canvasElement.removeEventListener("pointermove", onPointerMove, true);
      canvasElement.removeEventListener("pointerup", onPointerUp, true);
      canvasElement.removeEventListener("pointercancel", onPointerCancel, true);
    };
  }, [canvasElement, geometryIndex, marqueeMode, onSelectionChange, viewport]);

  if (!rect) {
    return null;
  }
  return (
    <ViewportPortal>
      <div
        aria-hidden="true"
        className="setta-adapter-proof__marquee"
        data-proof-marquee=""
        style={{
          height: rect.height,
          transform: `translate(${rect.x}px, ${rect.y}px)`,
          width: rect.width,
        }}
      />
    </ViewportPortal>
  );
}

function isInteractiveMarqueeTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      "a, button, input, select, textarea, [contenteditable='true'], [role='button'], .react-flow__controls, .setta-adapter-proof__controls",
    ) !== null
  );
}

export function AdapterProofViewportObserver({
  onViewport,
}: {
  onViewport(viewport: Viewport): void;
}) {
  const viewport = useViewport();
  useEffect(() => onViewport(viewport), [onViewport, viewport]);
  return null;
}

function measuredSelectionRoots(
  geometryIndex: WorkspaceGeometryIndex,
  selectedSectionIds: ReadonlySet<string>,
): readonly string[] {
  return geometryIndex.selectionRoots(
    [...selectedSectionIds].filter((sectionId) => geometryIndex.has(sectionId)),
  );
}

function marqueeRect(start: WorkspacePoint, end: WorkspacePoint): WorkspaceRect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.max(start.x, end.x) - x,
    height: Math.max(start.y, end.y) - y,
  };
}

function domRect(rect: DOMRect): { x: number; y: number; width: number; height: number } {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function measuredFramesMatch(left: MeasuredWorkspaceFrame, right: MeasuredWorkspaceFrame): boolean {
  return (
    left.sectionId === right.sectionId &&
    left.parentSectionId === right.parentSectionId &&
    left.depth === right.depth &&
    left.order === right.order &&
    Math.abs(left.rect.x - right.rect.x) <= SAME_FRAME_TOLERANCE &&
    Math.abs(left.rect.y - right.rect.y) <= SAME_FRAME_TOLERANCE &&
    Math.abs(left.rect.width - right.rect.width) <= SAME_FRAME_TOLERANCE &&
    Math.abs(left.rect.height - right.rect.height) <= SAME_FRAME_TOLERANCE
  );
}
