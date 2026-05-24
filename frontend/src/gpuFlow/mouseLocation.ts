import { useEffect } from "react";
import { screenToFlowPosition, setCenter } from "./viewportActions";
import type { GpuPoint } from "./viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "./viewportStore";

type ZoomToMouseLocationOptions = {
  readonly overviewWidth?: number | undefined;
  readonly store?: GpuFlowViewportStoreApi | undefined;
  readonly zoom?: number | undefined;
};

export let mouseLocation: GpuPoint = { x: 0, y: 0 };

export function addGpuMouseLocationListener(): () => void {
  function handleMouseMove(event: MouseEvent) {
    mouseLocation = {
      x: event.clientX,
      y: event.clientY,
    };
  }

  window.addEventListener("mousemove", handleMouseMove);
  return () => window.removeEventListener("mousemove", handleMouseMove);
}

export function useAddMouseLocationListener() {
  useEffect(() => {
    return addGpuMouseLocationListener();
  }, []);
}

export function zoomToMouseLocation(
  options: ZoomToMouseLocationOptions = {},
): boolean {
  const store = options.store ?? gpuFlowViewportStore;
  const { x, y } = screenToFlowPosition(mouseLocation, {
    store,
  });
  return setCenter(x, y, {
    overviewWidth: options.overviewWidth,
    store,
    zoom: options.zoom ?? store.getState().defaultZoom,
  });
}
