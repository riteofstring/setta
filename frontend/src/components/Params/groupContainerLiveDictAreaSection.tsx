import _ from "lodash";
import { useMemo } from "react";
import {
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrShownParamIds,
  getParamDisplayName,
} from "state/actions/sectionInfos";
import { paramNameFromPathArray } from "state/actions/sections/sectionContents";
import {
  useMisc,
  useProjectState,
  useSettings,
  type ZustandProjectState,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { C } from "utils/c";
import {
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";
import {
  LiveDictArea,
  type LiveDictAreaProps,
} from "./groupContainerLiveDictArea";
import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";

export type LiveDictAreaSectionProps = {
  bgColor: string;
  handleColumnResizeStart: LiveDictAreaRenderBoundaryInput["handleColumnResizeStart"];
  onMaxNestedDepthChange?: LiveDictAreaProps["onMaxNestedDepthChange"];
  sectionId: string;
  sectionTypeName: SectionTypeEnum;
};

export function LiveDictAreaSection({
  bgColor,
  handleColumnResizeStart,
  onMaxNestedDepthChange,
  sectionId,
  sectionTypeName,
}: LiveDictAreaSectionProps) {
  const {
    edgeInputPorts,
    hideUnpinnedParams,
    paramFilter,
    positionAndSizeLocked,
    edgeInputParams,
    edgeOutputPorts,
    pinnedRequiredParamIdsToPaths,
    pinnedTopLevelParamIds,
    selectedParams,
    unpinnedRequiredParamIdsToPaths,
    unpinnedTopLevelParamIds,
    styleColor,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const pinned = getCurrShownParamIds(state, sectionId, true, true);
    const unpinned = getCurrShownParamIds(state, sectionId, false, true);

    return {
      edgeInputPorts: impl.edgeInputParams.map((paramId) => {
        const path = {
          ...pinned.requiredParamIdsToPaths,
          ...unpinned.requiredParamIdsToPaths,
        }[paramId];
        const rawLabel = path
          ? paramNameFromPathArray(state, sectionId, path)
          : getParamDisplayName(state, sectionId, paramId);
        const label = rawLabel.trim().length === 0 ? "(unnamed)" : rawLabel;
        return { id: paramId, label };
      }),
      hideUnpinnedParams: impl.hideUnpinnedParams,
      paramFilter: impl.paramFilter,
      positionAndSizeLocked: impl.positionAndSizeLocked,
      edgeInputParams: impl.edgeInputParams,
      edgeOutputPorts: impl.edgeOutputPorts.map((port) => ({
        id: port.id,
        label:
          port.accessor.trim() === ""
            ? C.EDGE_OUTPUT_BASE_LABEL
            : port.accessor,
      })),
      pinnedRequiredParamIdsToPaths: pinned.requiredParamIdsToPaths,
      pinnedTopLevelParamIds: pinned.topLevelParamIds,
      selectedParams: impl.selectedParams ?? [],
      unpinnedRequiredParamIdsToPaths: unpinned.requiredParamIdsToPaths,
      unpinnedTopLevelParamIds: unpinned.topLevelParamIds,
      styleColor: impl.styleColor ?? null,
    };
  }, _.isEqual);
  const { canEditLayout, canEditStructure } = useShareCapabilities();
  const isSelectingParams = useMisc((state) => state.isSelectingParams);
  const unpinnedParamsAreaMinHeight = useSettings(
    (state) => state.sectionSizingPolicy.globals.unpinnedParamsAreaMinHeight,
  );
  const allRequiredParamIdsToPaths = useMemo(
    () => ({
      ...pinnedRequiredParamIdsToPaths,
      ...unpinnedRequiredParamIdsToPaths,
    }),
    [pinnedRequiredParamIdsToPaths, unpinnedRequiredParamIdsToPaths],
  );
  const allTopLevelParamIds = useMemo(
    () => [...pinnedTopLevelParamIds, ...unpinnedTopLevelParamIds],
    [pinnedTopLevelParamIds, unpinnedTopLevelParamIds],
  );
  const displayNamesById = useProjectState(
    (state) =>
      buildParamDisplayNameMap({
        state,
        sectionId,
        topLevelParamIds: allTopLevelParamIds,
        requiredParamIdsToPaths: allRequiredParamIdsToPaths,
      }),
    _.isEqual,
  );
  const liveDictAreaInput = useMemo(
    () => ({
      bgColor,
      canConnect: canEditStructure && !isSelectingParams,
      edgeInputParams,
      hideUnpinnedParams,
      paramFilter,
      getParamDisplayName: (paramId: string) =>
        displayNamesById[paramId] ?? paramId,
      handleColumnResizeStart,
      inputPorts: edgeInputPorts,
      isSelectingParams,
      outputPorts: edgeOutputPorts,
      pinned: {
        requiredParamIdsToPaths: pinnedRequiredParamIdsToPaths,
        topLevelParamIds: pinnedTopLevelParamIds,
      },
      positionAndSizeLocked,
      sectionId,
      sectionTypeName,
      selectedParamIds: selectedParams,
      styleColor,
      unpinned: {
        canEditLayout,
        configuredMinHeight: unpinnedParamsAreaMinHeight,
        pinnedRequiredParamIdsToPaths,
        pinnedTopLevelParamIds,
        positionAndSizeLocked,
        requiredParamIdsToPaths: unpinnedRequiredParamIdsToPaths,
        topLevelParamIds: unpinnedTopLevelParamIds,
      },
    }),
    [
      bgColor,
      canEditLayout,
      canEditStructure,
      displayNamesById,
      edgeInputParams,
      edgeInputPorts,
      edgeOutputPorts,
      handleColumnResizeStart,
      hideUnpinnedParams,
      isSelectingParams,
      paramFilter,
      pinnedRequiredParamIdsToPaths,
      pinnedTopLevelParamIds,
      positionAndSizeLocked,
      sectionId,
      sectionTypeName,
      selectedParams,
      styleColor,
      unpinnedParamsAreaMinHeight,
      unpinnedRequiredParamIdsToPaths,
      unpinnedTopLevelParamIds,
    ],
  );

  return (
    <LiveDictArea
      input={liveDictAreaInput}
      onMaxNestedDepthChange={onMaxNestedDepthChange}
    />
  );
}

function buildParamDisplayNameMap({
  state,
  sectionId,
  topLevelParamIds,
  requiredParamIdsToPaths,
}: {
  state: ZustandProjectState;
  sectionId: string;
  topLevelParamIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
}): Record<string, string> {
  const paramIds = new Set(topLevelParamIds);

  Object.values(requiredParamIdsToPaths).forEach((path) => {
    path.forEach((paramId) => {
      paramIds.add(paramId);
    });
  });

  const displayNamesById: Record<string, string> = {};
  for (const paramId of paramIds) {
    displayNamesById[paramId] = getParamDisplayName(state, sectionId, paramId);
  }

  return displayNamesById;
}
