import { useEffect } from "react";
import { useSettings } from "state/stores/uiPreferenceStores";
import { Position } from "utils/generatedTypes";
import { screenToFlowPosition, setCenter } from "../hooks/useViewportHelper";

export let mouseLocation: Position = { x: 0, y: 0 };

function addMouseLocationListener(): () => void {
  function handleMouseMove(e: MouseEvent) {
    mouseLocation = {
      x: e.clientX,
      y: e.clientY,
    };
  }

  window.addEventListener("mousemove", handleMouseMove);
  return () => window.removeEventListener("mousemove", handleMouseMove);
}

export function useAddMouseLocationListener() {
  useEffect(() => {
    return addMouseLocationListener();
  }, []);
}

export function zoomToMouseLocation() {
  const { x, y } = screenToFlowPosition(mouseLocation);
  const { defaultZoomLevel: zoom, transitionDuration: duration } =
    useSettings.getState().gui;
  setCenter(x, y, { zoom, duration });
}
