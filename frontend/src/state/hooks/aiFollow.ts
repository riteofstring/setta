import { useReactFlow } from "forks/xyflow/core/store";
import {
  getSectionBounds,
  getViewportForBounds,
} from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
import { getHighestAncestor } from "state/actions/sectionInfos";
import { setZIndices } from "state/actions/sections/sectionPositions";
import {
  getAllowedChatIdsForProject,
  getSectionIdsForProject,
} from "state/aiFollowUtils";
import { useAIFollow, useMisc, useProjectState } from "state/definitions";
import { shallow } from "zustand/shallow";

const TOOL_RESULT_FOLLOW_GROUP_WINDOW_MS = 300;

function collectAIFollowTopLevelIds(
  toolArgumentSectionIds: Array<string>,
  toolResultSectionIds: Array<string>,
  parentSectionMap: Record<string, string | null>,
): Array<string> {
  if (
    toolArgumentSectionIds.length === 0 &&
    toolResultSectionIds.length === 0
  ) {
    return [];
  }

  const parentIdGetter = (id: string): string | null => {
    const parentId = parentSectionMap[id];
    if (parentId === undefined || parentId === null) {
      return null;
    }
    return parentId;
  };

  const topLevelIds: Array<string> = [];
  const seenIds = new Set<string>();
  for (const sectionId of toolArgumentSectionIds) {
    const topLevelId = getHighestAncestor(sectionId, parentIdGetter);
    if (!seenIds.has(topLevelId)) {
      seenIds.add(topLevelId);
      topLevelIds.push(topLevelId);
    }
  }
  for (const sectionId of toolResultSectionIds) {
    const topLevelId = getHighestAncestor(sectionId, parentIdGetter);
    if (!seenIds.has(topLevelId)) {
      seenIds.add(topLevelId);
      topLevelIds.push(topLevelId);
    }
  }

  return topLevelIds;
}

export function useAIFollowViewport(): void {
  const { projectConfigId, sectionVariantMap, sectionVariants, sectionImpls } =
    useProjectState(
      (state) => ({
        projectConfigId: state.projectConfig.id,
        sectionVariantMap: state.projectConfig.sectionVariantMap,
        sectionVariants: state.sectionVariants,
        sectionImpls: state.sectionImpls,
      }),
      _.isEqual,
    );
  const { width, height } = useReactFlow(
    (state) => ({
      width: state.width,
      height: state.height,
    }),
    shallow,
  );
  const { mode, sectionIds, toolResultSectionIds } = useAIFollow((state) => {
    const allowedChatIds = getAllowedChatIdsForProject(
      state.mode,
      state.selectedChatIdsByProjectConfigId,
      state.selectedSectionIdsByProjectConfigId,
      projectConfigId,
      sectionVariantMap,
      sectionVariants,
      sectionImpls,
    );
    return {
      mode: state.mode,
      sectionIds: getSectionIdsForProject(
        state.toolArgumentsIdsByProjectConfigId,
        projectConfigId,
        allowedChatIds,
      ),
      toolResultSectionIds: getSectionIdsForProject(
        state.toolResultIdsByProjectConfigId,
        projectConfigId,
        allowedChatIds,
      ),
    };
  }, _.isEqual);
  const [groupedToolResultSectionIds, setGroupedToolResultSectionIds] =
    useState<string[]>([]);
  const toolResultGroupTimeout = useRef<number | null>(null);
  const followTransitionId = useRef(0);
  const toolResultSectionIdsKey = toolResultSectionIds.join("|");

  useEffect(() => {
    if (mode !== "off") {
      return;
    }
    useAIFollow.setState((state) => {
      state.isFollowTransitioning = false;
    });
  }, [mode]);

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
  }, [projectConfigId, toolResultSectionIdsKey]);

  const combinedSectionIds = useMemo(() => {
    if (sectionIds.length === 0) {
      return groupedToolResultSectionIds;
    }
    if (groupedToolResultSectionIds.length === 0) {
      return sectionIds;
    }
    return Array.from(new Set([...sectionIds, ...groupedToolResultSectionIds]));
  }, [sectionIds, groupedToolResultSectionIds]);

  const sectionIdsKey = useMemo(
    () => combinedSectionIds.join("|"),
    [combinedSectionIds],
  );

  useEffect(() => {
    if (mode === "off") {
      return;
    }
    if (combinedSectionIds.length === 0) {
      return;
    }

    const bounds = getSectionBounds(combinedSectionIds);
    if (!bounds) {
      return;
    }

    if (width === 0 || height === 0) {
      return;
    }

    const { x, y, zoom } = getViewportForBounds({
      bounds,
      height,
      keepCurrZoomIfPossible: true,
      maxZoom: 1,
      minZoom: 0,
      padding: 0.1,
      width,
    });

    const duration = 500;
    const transitionId = followTransitionId.current + 1;
    followTransitionId.current = transitionId;
    useAIFollow.setState((state) => {
      state.isFollowTransitioning = true;
    });
    const clearTransitionLock = () => {
      if (followTransitionId.current !== transitionId) {
        return;
      }
      useAIFollow.setState((state) => {
        state.isFollowTransitioning = false;
      });
    };
    useReactFlow.setState({ transform: [x, y, zoom] });
    const clearTransitionLockTimer = window.setTimeout(
      clearTransitionLock,
      duration,
    );
    return () => window.clearTimeout(clearTransitionLockTimer);
  }, [height, mode, projectConfigId, sectionIdsKey, width]);
}

export function useAIFollowZIndexBoost(): void {
  const {
    projectConfigId,
    parentSectionMap,
    sectionVariantMap,
    sectionVariants,
    sectionImpls,
  } = useProjectState(
    (state) => ({
      projectConfigId: state.projectConfig.id,
      parentSectionMap: state.parentSectionMap,
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      sectionVariants: state.sectionVariants,
      sectionImpls: state.sectionImpls,
    }),
    _.isEqual,
  );
  const mouseDownDraggingSection = useMisc(
    (state) => state.mouseDownDraggingSection,
  );
  const { toolArgumentSectionIds, toolResultSectionIds } = useAIFollow(
    (state) => {
      const allowedChatIds = getAllowedChatIdsForProject(
        state.mode,
        state.selectedChatIdsByProjectConfigId,
        state.selectedSectionIdsByProjectConfigId,
        projectConfigId,
        sectionVariantMap,
        sectionVariants,
        sectionImpls,
      );
      return {
        toolArgumentSectionIds: getSectionIdsForProject(
          state.toolArgumentsIdsByProjectConfigId,
          projectConfigId,
          allowedChatIds,
        ),
        toolResultSectionIds: getSectionIdsForProject(
          state.toolResultIdsByProjectConfigId,
          projectConfigId,
          allowedChatIds,
        ),
      };
    },
    _.isEqual,
  );

  const aiFollowTopLevelIds = useMemo(() => {
    return collectAIFollowTopLevelIds(
      toolArgumentSectionIds,
      toolResultSectionIds,
      parentSectionMap,
    );
  }, [parentSectionMap, toolArgumentSectionIds, toolResultSectionIds]);
  const aiFollowTopLevelIdsKey = useMemo(
    () => aiFollowTopLevelIds.join("|"),
    [aiFollowTopLevelIds],
  );

  useEffect(() => {
    if (aiFollowTopLevelIds.length === 0) {
      return;
    }
    if (mouseDownDraggingSection) {
      return;
    }
    setZIndices(aiFollowTopLevelIds);
  }, [aiFollowTopLevelIdsKey, mouseDownDraggingSection, projectConfigId]);
}
