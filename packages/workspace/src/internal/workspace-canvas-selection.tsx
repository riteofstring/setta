import { ViewportPortal } from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type {
  MarqueeSelectionMode,
  WorkspaceGeometryIndex,
  WorkspacePoint,
  WorkspaceRect,
} from "./geometry-index.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";

type MarqueeSession = Readonly<{
  baselineSelection: readonly string[];
  pointerId: number;
  start: WorkspacePoint;
}>;

export type WorkspaceMarqueeSelectionBindings = Readonly<{
  active: boolean;
  cancel(): void;
  onPointerCancel(event: ReactPointerEvent<HTMLDivElement>): void;
  onPointerDownCapture(event: ReactPointerEvent<HTMLDivElement>): void;
  onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void;
  onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void;
  overlay: ReactNode;
}>;

function useGeometryRevision(index: WorkspaceGeometryIndex): number {
  const subscribe = useCallback((listener: () => void) => index.subscribe(listener), [index]);
  const snapshot = useCallback(() => index.revision, [index]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

function measuredSelectionRoots(
  geometryIndex: WorkspaceGeometryIndex,
  selectedSectionIds: readonly string[],
): readonly string[] {
  const measured = selectedSectionIds.filter((sectionId) => geometryIndex.has(sectionId));
  return measured.length > 0 ? geometryIndex.selectionRoots(measured) : [];
}

export function WorkspaceSelectionOverlay({
  geometryIndex,
  hidden,
  selectedSectionIds,
}: Readonly<{
  geometryIndex: WorkspaceGeometryIndex;
  hidden: boolean;
  selectedSectionIds: readonly string[];
}>) {
  useGeometryRevision(geometryIndex);
  if (hidden) {
    return null;
  }
  const selectionRoots = measuredSelectionRoots(geometryIndex, selectedSectionIds);
  const bounds = geometryIndex.boundsWhenReady(selectionRoots);
  if (!bounds) {
    return null;
  }
  return (
    <ViewportPortal>
      <div
        aria-hidden="true"
        className="setta-workspace__selection-overlay"
        data-workspace-selection-count={selectionRoots.length}
        data-workspace-selection-roots={selectionRoots.join(",")}
        style={{
          height: bounds.height,
          transform: `translate(${String(bounds.x)}px, ${String(bounds.y)}px)`,
          width: bounds.width,
        }}
      />
    </ViewportPortal>
  );
}

function WorkspaceMarqueeOverlay({ rect }: Readonly<{ rect: WorkspaceRect }>) {
  return (
    <ViewportPortal>
      <div
        aria-hidden="true"
        className="setta-workspace__marquee"
        data-workspace-marquee=""
        style={{
          height: rect.height,
          transform: `translate(${String(rect.x)}px, ${String(rect.y)}px)`,
          width: rect.width,
        }}
      />
    </ViewportPortal>
  );
}

export function workspaceMarqueeRect(start: WorkspacePoint, end: WorkspacePoint): WorkspaceRect {
  return {
    height: Math.abs(end.y - start.y),
    width: Math.abs(end.x - start.x),
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
  };
}

function isPaneMarqueeStart(event: ReactPointerEvent<HTMLDivElement>): boolean {
  const ElementConstructor = event.currentTarget.ownerDocument.defaultView?.Element;
  if (!ElementConstructor || !(event.target instanceof ElementConstructor)) {
    return false;
  }
  return (
    event.button === 0 &&
    event.isPrimary &&
    event.shiftKey &&
    event.target.classList.contains("react-flow__pane")
  );
}

function releasePointer(element: HTMLDivElement, pointerId: number): void {
  if (element.hasPointerCapture(pointerId)) {
    element.releasePointerCapture(pointerId);
  }
}

export function useWorkspaceMarqueeSelection({
  geometry,
  geometryIndex,
  mode,
  onSelectionChange,
  selectedSectionIds,
}: Readonly<{
  geometry: WorkspaceGeometryMeasurements;
  geometryIndex: WorkspaceGeometryIndex;
  mode: MarqueeSelectionMode;
  onSelectionChange(sectionIds: readonly string[]): void;
  selectedSectionIds: React.RefObject<readonly string[]>;
}>): WorkspaceMarqueeSelectionBindings {
  const sessionRef = useRef<MarqueeSession | null>(null);
  const [rect, setRect] = useState<WorkspaceRect | null>(null);
  const cancel = useCallback(() => {
    sessionRef.current = null;
    setRect(null);
  }, []);
  useEffect(() => cancel, [cancel]);

  const onPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isPaneMarqueeStart(event)) {
        return;
      }
      geometry.flushMeasurement();
      const start = geometry.clientPointToWorkspace({ x: event.clientX, y: event.clientY });
      sessionRef.current = {
        baselineSelection: [...selectedSectionIds.current],
        pointerId: event.pointerId,
        start,
      };
      setRect(workspaceMarqueeRect(start, start));
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    },
    [geometry, selectedSectionIds],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      const end = geometry.clientPointToWorkspace({ x: event.clientX, y: event.clientY });
      setRect(workspaceMarqueeRect(session.start, end));
      event.preventDefault();
      event.stopPropagation();
    },
    [geometry],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      const end = geometry.clientPointToWorkspace({ x: event.clientX, y: event.clientY });
      const completedRect = workspaceMarqueeRect(session.start, end);
      const matches = geometryIndex
        .framesInRect(completedRect, mode)
        .map(({ sectionId }) => sectionId);
      onSelectionChange([...new Set([...session.baselineSelection, ...matches])]);
      sessionRef.current = null;
      setRect(null);
      releasePointer(event.currentTarget, event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    },
    [geometry, geometryIndex, mode, onSelectionChange],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      releasePointer(event.currentTarget, event.pointerId);
      cancel();
      event.preventDefault();
      event.stopPropagation();
    },
    [cancel],
  );

  return {
    active: rect !== null,
    cancel,
    onPointerCancel,
    onPointerDownCapture,
    onPointerMove,
    onPointerUp,
    overlay: rect ? <WorkspaceMarqueeOverlay rect={rect} /> : null,
  };
}
