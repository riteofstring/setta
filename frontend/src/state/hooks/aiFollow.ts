import { zoomIdentity } from "d3-zoom";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  getD3Transition,
  getSectionBounds,
  getViewportForBounds,
} from "forks/xyflow/core/utils/graph";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  useAIFollow,
  useAIFollowToolResult,
  useAIStore,
  useProjectState,
} from "state/definitions";
import { shallow } from "zustand/shallow";

const TOOL_RESULT_FOLLOW_GROUP_WINDOW_MS = 300;

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
  const toolResultSectionIds = useAIFollowToolResult((state) => {
    if (!activeChatId) {
      return [];
    }
    const projectEntries = state.idsByProjectConfigId[projectConfigId];
    if (!projectEntries) {
      return [];
    }
    const idsByType = projectEntries[activeChatId];
    return idsByType?.section ?? [];
  });
  const toolResultSectionIdsKey = toolResultSectionIds.join("|");
  const [groupedToolResultSectionIds, setGroupedToolResultSectionIds] = useState<
    string[]
  >([]);
  const toolResultGroupTimeout = useRef<number | null>(null);

  useEffect(() => {
    if (toolResultGroupTimeout.current !== null) {
      window.clearTimeout(toolResultGroupTimeout.current);
      toolResultGroupTimeout.current = null;
    }
    if (toolResultSectionIds.length === 0) {
      setGroupedToolResultSectionIds([]);
      return;
    }
    toolResultGroupTimeout.current = window.setTimeout(() => {
      setGroupedToolResultSectionIds(toolResultSectionIds);
      toolResultGroupTimeout.current = null;
    }, TOOL_RESULT_FOLLOW_GROUP_WINDOW_MS);
    return () => {
      if (toolResultGroupTimeout.current !== null) {
        window.clearTimeout(toolResultGroupTimeout.current);
        toolResultGroupTimeout.current = null;
      }
    };
  }, [
    activeChatId,
    projectConfigId,
    toolResultSectionIdsKey,
  ]);

  const combinedSectionIds = useMemo(() => {
    if (sectionIds.length === 0) {
      return groupedToolResultSectionIds;
    }
    if (groupedToolResultSectionIds.length === 0) {
      return sectionIds;
    }
    return Array.from(
      new Set([...sectionIds, ...groupedToolResultSectionIds]),
    );
  }, [sectionIds, groupedToolResultSectionIds]);

  const sectionIdsKey = useMemo(
    () => combinedSectionIds.join("|"),
    [combinedSectionIds],
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!activeChatId) {
      return;
    }
    if (combinedSectionIds.length === 0) {
      return;
    }

    const bounds = getSectionBounds(combinedSectionIds);
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
