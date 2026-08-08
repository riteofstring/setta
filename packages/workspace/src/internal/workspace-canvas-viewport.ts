import type { Viewport } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { WorkspaceGestureOptions, WorkspaceViewport } from "../core.js";
import { createWorkspaceCanvasGesturePolicy } from "./workspace-canvas-gesture-policy.js";
import {
  createWorkspaceCanvasController,
  type WorkspaceCanvasController,
} from "./workspace-canvas-navigation.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import { WorkspaceViewportLifecycle } from "./workspace-viewport-lifecycle.js";
import { workspaceViewportsMatch } from "./workspace-viewport-synchronizer.js";

function viewportFromUpstream(viewport: Viewport): WorkspaceViewport {
  return { x: viewport.x, y: viewport.y, zoom: viewport.zoom };
}

function advanceViewportLifecycle(
  lifecycle: WorkspaceViewportLifecycle,
  viewport: WorkspaceViewport,
  programmaticViewport: WorkspaceViewport | null,
  event: MouseEvent | TouchEvent | null,
  phase: "begin" | "update",
) {
  if (!event && programmaticViewport) {
    lifecycle.synchronize(viewport);
    return;
  }
  if (phase === "begin") {
    if (lifecycle.isActive()) {
      lifecycle.update(viewport);
    } else {
      lifecycle.begin(viewport);
    }
    return;
  }
  lifecycle.update(viewport);
}

export function useWorkspaceCanvasViewport({
  canonicalViewport,
  geometry,
  gestureOptions,
  onCanvasControllerChange,
  onDetach,
  onViewportCommit,
}: Readonly<{
  canonicalViewport: WorkspaceViewport;
  geometry: WorkspaceGeometryMeasurements;
  gestureOptions: WorkspaceGestureOptions;
  onCanvasControllerChange(controller: WorkspaceCanvasController | null): void;
  onDetach(): void;
  onViewportCommit(viewport: WorkspaceViewport): void;
}>) {
  const gestureOptionsRef = useRef(gestureOptions);
  gestureOptionsRef.current = gestureOptions;
  const canvasController = useMemo(
    () =>
      createWorkspaceCanvasController(geometry, () => ({
        maxZoom: gestureOptionsRef.current.maxZoom,
        minZoom: gestureOptionsRef.current.minZoom,
      })),
    [geometry],
  );
  const [initialized, setInitialized] = useState(false);
  const lifecycleRef = useRef<WorkspaceViewportLifecycle | null>(null);
  lifecycleRef.current ??= new WorkspaceViewportLifecycle(canonicalViewport);
  const lifecycle = lifecycleRef.current;
  const programmaticViewportRef = useRef<WorkspaceViewport | null>(null);
  const mountedRef = useRef(false);
  const gesturePolicy = useMemo(
    () => createWorkspaceCanvasGesturePolicy(gestureOptions),
    [gestureOptions],
  );

  useEffect(() => {
    if (!initialized) {
      return;
    }
    onCanvasControllerChange(canvasController);
    return () => onCanvasControllerChange(null);
  }, [canvasController, initialized, onCanvasControllerChange]);

  const handleInitialized = useCallback(() => setInitialized(true), []);
  const getCanvasBounds = useCallback(() => geometry.canvasBounds(), [geometry]);
  const handleCanvasElement = useCallback(
    (element: HTMLDivElement | null) => {
      mountedRef.current = element !== null;
      if (!element) {
        onDetach();
        const baseline = lifecycle.cancel();
        if (baseline) {
          geometry.setViewport(baseline);
        }
        programmaticViewportRef.current = null;
      }
      geometry.setCanvasElement(element);
    },
    [geometry, lifecycle, onDetach],
  );
  const handleMoveStart = useCallback(
    (event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      if (!mountedRef.current) {
        return;
      }
      if (event) {
        programmaticViewportRef.current = null;
      }
      const nextViewport = viewportFromUpstream(viewport);
      geometry.setViewport(nextViewport);
      advanceViewportLifecycle(
        lifecycle,
        nextViewport,
        programmaticViewportRef.current,
        event,
        "begin",
      );
    },
    [geometry, lifecycle],
  );
  const handleMove = useCallback(
    (event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      if (!mountedRef.current) {
        return;
      }
      const nextViewport = viewportFromUpstream(viewport);
      geometry.setViewport(nextViewport);
      advanceViewportLifecycle(
        lifecycle,
        nextViewport,
        programmaticViewportRef.current,
        event,
        "update",
      );
    },
    [geometry, lifecycle],
  );
  const handleMoveEnd = useCallback(
    (event: MouseEvent | TouchEvent | null, viewport: Viewport) => {
      if (!mountedRef.current) {
        return;
      }
      const nextViewport = viewportFromUpstream(viewport);
      if (!event) {
        if (
          workspaceViewportsMatch(programmaticViewportRef.current ?? nextViewport, nextViewport)
        ) {
          if (!lifecycle.isActive()) {
            geometry.completeViewport(nextViewport);
            lifecycle.synchronize(nextViewport);
          }
          programmaticViewportRef.current = null;
        }
        return;
      }
      if (!workspaceViewportsMatch(lifecycle.current(), nextViewport)) {
        return;
      }
      geometry.setViewport(nextViewport);
      const completed = lifecycle.complete(nextViewport);
      if (completed) {
        onViewportCommit(completed);
      }
    },
    [geometry, lifecycle, onViewportCommit],
  );

  return {
    canvasController,
    gesturePolicy,
    getCanvasBounds,
    handleCanvasElement,
    handleInitialized,
    handleMove,
    handleMoveEnd,
    handleMoveStart,
    lifecycle,
    programmaticViewportRef,
  };
}
