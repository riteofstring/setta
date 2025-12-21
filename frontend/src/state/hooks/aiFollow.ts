import { zoomIdentity } from "d3-zoom";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  getD3Transition,
  getSectionBounds,
  getViewportForBounds,
} from "forks/xyflow/core/utils/graph";
import { useEffect, useMemo } from "react";
import { useAIFollow, useAIStore, useProjectState } from "state/definitions";
import { shallow } from "zustand/shallow";

export function useAIFollowViewport(): void {
  const enabled = useAIFollow((state) => state.enabled);
  const activeChatId = useAIStore((state) => state.activeChatId);
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const { d3Zoom, d3Selection, width, height } = useReactFlow(
    (state) => ({
      d3Zoom: state.d3Zoom,
      d3Selection: state.d3Selection,
      width: state.width,
      height: state.height,
    }),
    shallow,
  );
  const sectionIds = useAIFollow((state) => {
    if (!activeChatId) {
      return [];
    }
    const projectEntries = state.sectionIdsByProjectConfigId[projectConfigId];
    if (!projectEntries) {
      return [];
    }
    return projectEntries[activeChatId] ?? [];
  });

  const sectionIdsKey = useMemo(() => sectionIds.join("|"), [sectionIds]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!activeChatId) {
      return;
    }
    if (sectionIds.length === 0) {
      return;
    }

    const bounds = getSectionBounds(sectionIds);
    if (!bounds) {
      return;
    }

    if (!d3Zoom || !d3Selection) {
      return;
    }
    if (width === 0 || height === 0) {
      return;
    }

    const { x, y, zoom } = getViewportForBounds(
      bounds,
      width,
      height,
      0,
      1,
      0.1,
      true,
    );

    // const duration = useSettings.getState().gui.transitionDuration;
    const duration = 500;
    const nextTransform = zoomIdentity.translate(x, y).scale(zoom);
    d3Zoom.transform(getD3Transition(d3Selection, duration), nextTransform);
  }, [
    activeChatId,
    d3Selection,
    d3Zoom,
    enabled,
    height,
    projectConfigId,
    sectionIdsKey,
    width,
  ]);
}
