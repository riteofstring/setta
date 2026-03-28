import type { SectionTypeEnum } from "utils/generatedTypes";
import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";

export type LiveDictAreaSectionDisplayNamesInput = {
  getParamDisplayName: (paramId: string) => string;
  requiredParamIdsToPaths: Record<string, string[]>;
  topLevelParamIds: string[];
};

export type LiveDictAreaSectionInput = {
  bgColor: string;
  canEditLayout: boolean;
  canEditStructure: boolean;
  displayNamesById: Record<string, string>;
  edgeInputParams: string[];
  edgeInputPorts: LiveDictAreaRenderBoundaryInput["inputPorts"];
  edgeOutputPorts: LiveDictAreaRenderBoundaryInput["outputPorts"];
  handleColumnResizeStart: LiveDictAreaRenderBoundaryInput["handleColumnResizeStart"];
  hideUnpinnedParams: boolean;
  isSelectingParams: boolean;
  paramFilter: string;
  pinnedRequiredParamIdsToPaths: Record<string, string[]>;
  pinnedTopLevelParamIds: string[];
  positionAndSizeLocked: boolean;
  sectionId: string;
  sectionTypeName: SectionTypeEnum;
  selectedParamIds: string[];
  styleColor: string | null;
  unpinnedParamsAreaMinHeight: number;
  unpinnedRequiredParamIdsToPaths: Record<string, string[]>;
  unpinnedTopLevelParamIds: string[];
};

export function buildLiveDictAreaSectionDisplayNames({
  getParamDisplayName,
  requiredParamIdsToPaths,
  topLevelParamIds,
}: LiveDictAreaSectionDisplayNamesInput): Record<string, string> {
  const paramIds = new Set(topLevelParamIds);

  Object.values(requiredParamIdsToPaths).forEach((path) => {
    path.forEach((paramId) => {
      paramIds.add(paramId);
    });
  });

  const displayNamesById: Record<string, string> = {};
  for (const paramId of paramIds) {
    displayNamesById[paramId] = getParamDisplayName(paramId);
  }

  return displayNamesById;
}

export function buildLiveDictAreaSectionInput({
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
  selectedParamIds,
  styleColor,
  unpinnedParamsAreaMinHeight,
  unpinnedRequiredParamIdsToPaths,
  unpinnedTopLevelParamIds,
}: LiveDictAreaSectionInput): LiveDictAreaRenderBoundaryInput {
  return {
    bgColor,
    canConnect: canEditStructure && !isSelectingParams,
    edgeInputParams,
    getParamDisplayName: (paramId: string) =>
      displayNamesById[paramId] ?? paramId,
    handleColumnResizeStart,
    hideUnpinnedParams,
    inputPorts: edgeInputPorts,
    isSelectingParams,
    outputPorts: edgeOutputPorts,
    paramFilter,
    pinned: {
      requiredParamIdsToPaths: pinnedRequiredParamIdsToPaths,
      topLevelParamIds: pinnedTopLevelParamIds,
    },
    positionAndSizeLocked,
    sectionId,
    sectionTypeName,
    selectedParamIds,
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
  };
}
