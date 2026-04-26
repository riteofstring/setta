import { useEffect } from "react";
import { useSettings } from "state/definitions";
import { screenToFlowPosition, setCenter } from "./viewportActions";
import type { GpuPoint } from "./viewportMath";
import type { GpuFlowViewportStoreApi } from "./viewportStore";

type ZoomToMouseLocationOptions = {
  readonly store?: GpuFlowViewportStoreApi | undefined;
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
  const { x, y } = screenToFlowPosition(mouseLocation, {
    store: options.store,
  });
  const zoom = useSettings.getState().gui.defaultZoomLevel;
  return setCenter(x, y, { store: options.store, zoom });
}
