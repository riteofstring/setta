import { zoomIdentity } from "d3-zoom";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  getD3Transition,
  getSectionBounds,
  getViewportForBounds,
} from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import { getSectionIdsForChat } from "state/aiFollowUtils";
import { useAIFollow, useAIStore, useProjectState } from "state/definitions";
import { shallow } from "zustand/shallow";

const TOOL_RESULT_FOLLOW_GROUP_WINDOW_MS = 300;

export function useAIFollowViewport(): void {
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
  const { enabled, sectionIds, toolResultSectionIds } = useAIFollow(
    (state) => {
      return {
        enabled: state.enabled,
        sectionIds: getSectionIdsForChat(
          state.toolArgumentsIdsByProjectConfigId,
          projectConfigId,
          activeChatId,
        ),
        toolResultSectionIds: getSectionIdsForChat(
          state.toolResultIdsByProjectConfigId,
          projectConfigId,
          activeChatId,
        ),
      };
    },
    _.isEqual,
  );
  const [groupedToolResultSectionIds, setGroupedToolResultSectionIds] = useState<
    string[]
  >([]);
  const toolResultGroupTimeout = useRef<number | null>(null);
  const toolResultSectionIdsKey = toolResultSectionIds.join("|");

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
  }, [activeChatId, projectConfigId, toolResultSectionIdsKey]);

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
