import { useEffect, useState, type RefObject } from "react";

import { gpuFlowViewportStore } from "gpuFlow/viewportStore";

import { getVisibleProjectSurfaceWidth } from "./projectGpuSelectionAdapter";
import {
  getProjectSurfaceClientDimensions,
  type ProjectSurfaceDimensions,
} from "./projectGpuSurfaceDimensions";

export function useProjectSurfaceDimensions(
  ref: RefObject<HTMLDivElement | null>,
): ProjectSurfaceDimensions {
  const [dimensions, setDimensions] = useState<ProjectSurfaceDimensions>({
    height: 0,
    width: 0,
  });

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const updateDimensions = (
      rect: Pick<DOMRectReadOnly, "height" | "width">,
    ) => {
      const nextDimensions = {
        height: rect.height,
        width: rect.width,
      };
      setDimensions(nextDimensions);
      gpuFlowViewportStore.getState().setViewportSize({
        height: nextDimensions.height,
        width: getVisibleProjectSurfaceWidth(nextDimensions.width),
      });
    };
    updateDimensions(getProjectSurfaceClientDimensions(node));
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      updateDimensions(entry.contentRect);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return dimensions;
}
