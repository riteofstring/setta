import { useReactFlow } from "@xyflow/react";
import { useEffect, type MutableRefObject } from "react";

import type { WorkspaceViewport } from "../core.js";
import type { WorkspaceGeometryMeasurements } from "./workspace-geometry-service.js";
import type { WorkspaceViewportLifecycle } from "./workspace-viewport-lifecycle.js";

export function workspaceViewportsMatch(
  first: WorkspaceViewport,
  second: WorkspaceViewport,
): boolean {
  return first.x === second.x && first.y === second.y && first.zoom === second.zoom;
}

export function WorkspaceViewportSynchronizer({
  geometry,
  lifecycle,
  programmaticViewportRef,
  synchronizationRevision,
  viewport,
}: Readonly<{
  geometry: WorkspaceGeometryMeasurements;
  lifecycle: WorkspaceViewportLifecycle;
  programmaticViewportRef: MutableRefObject<WorkspaceViewport | null>;
  synchronizationRevision: number;
  viewport: WorkspaceViewport;
}>) {
  const instance = useReactFlow();

  useEffect(() => {
    let active = true;
    const maySynchronize = lifecycle.synchronize(viewport);
    if (!maySynchronize || !instance.viewportInitialized) {
      return () => {
        active = false;
      };
    }
    const current = instance.getViewport();
    if (workspaceViewportsMatch(current, viewport)) {
      geometry.completeViewport(viewport);
      return () => {
        active = false;
      };
    }
    programmaticViewportRef.current = viewport;
    void instance.setViewport(viewport).then(() => {
      if (!active) {
        return;
      }
      geometry.completeViewport(viewport);
      geometry.flushMeasurement();
    });
    return () => {
      active = false;
      if (programmaticViewportRef.current === viewport) {
        programmaticViewportRef.current = null;
      }
    };
  }, [geometry, instance, lifecycle, programmaticViewportRef, synchronizationRevision, viewport]);

  return null;
}
