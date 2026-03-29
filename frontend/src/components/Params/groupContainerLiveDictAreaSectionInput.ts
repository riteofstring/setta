import { CodeObjTypeEnum, type SectionTypeEnum } from "utils/generatedTypes";
import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";
import type { ParamEditorKind } from "./paramEditorActivation";

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
  editorKindsById: Record<string, ParamEditorKind>;
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
  valuePreviewsById: Record<string, string>;
};

export function buildLiveDictAreaSectionDisplayNames({
  getParamDisplayName,
  requiredParamIdsToPaths,
  topLevelParamIds,
}: LiveDictAreaSectionDisplayNamesInput): Record<string, string> {
  const paramIds = collectLiveDictAreaParamIds({
    requiredParamIdsToPaths,
    topLevelParamIds,
  });
  const displayNamesById: Record<string, string> = {};

  for (const paramId of paramIds) {
    displayNamesById[paramId] = getParamDisplayName(paramId);
  }

  return displayNamesById;
}

export function buildLiveDictAreaSectionEditorKinds({
  getParamEditorKind,
  requiredParamIdsToPaths,
  topLevelParamIds,
}: {
  getParamEditorKind: (paramId: string) => ParamEditorKind;
  requiredParamIdsToPaths: Record<string, string[]>;
  topLevelParamIds: string[];
}): Record<string, ParamEditorKind> {
  const paramIds = collectLiveDictAreaParamIds({
    requiredParamIdsToPaths,
    topLevelParamIds,
  });
  const editorKindsById: Record<string, ParamEditorKind> = {};

  for (const paramId of paramIds) {
    editorKindsById[paramId] = getParamEditorKind(paramId);
  }

  return editorKindsById;
}

export function resolveLiveDictAreaValuePreview({
  codeObjType,
  value,
}: {
  codeObjType: CodeObjTypeEnum;
  value: string;
}): string | null {
  const normalizedValue = value.replace(/\s+/g, " ").trim();

  if (normalizedValue.length === 0) {
    return null;
  }

  if (codeObjType === CodeObjTypeEnum.PasswordParam) {
    return "\u2022\u2022\u2022\u2022\u2022\u2022";
  }

  return normalizedValue;
}

export function buildLiveDictAreaSectionValuePreviews({
  getParamValuePreview,
  requiredParamIdsToPaths,
  topLevelParamIds,
}: {
  getParamValuePreview: (paramId: string) => string | null;
  requiredParamIdsToPaths: Record<string, string[]>;
  topLevelParamIds: string[];
}): Record<string, string> {
  const paramIds = collectLiveDictAreaParamIds({
    requiredParamIdsToPaths,
    topLevelParamIds,
  });
  const valuePreviewsById: Record<string, string> = {};

  for (const paramId of paramIds) {
    const valuePreview = getParamValuePreview(paramId);
    if (valuePreview !== null) {
      valuePreviewsById[paramId] = valuePreview;
    }
  }

  return valuePreviewsById;
}

function collectLiveDictAreaParamIds({
  requiredParamIdsToPaths,
  topLevelParamIds,
}: {
  requiredParamIdsToPaths: Record<string, string[]>;
  topLevelParamIds: string[];
}) {
  const paramIds = new Set(topLevelParamIds);

  Object.values(requiredParamIdsToPaths).forEach((path) => {
    path.forEach((paramId) => {
      paramIds.add(paramId);
    });
  });

  return paramIds;
}

export function buildLiveDictAreaSectionInput({
  bgColor,
  canEditLayout,
  canEditStructure,
  displayNamesById,
  editorKindsById,
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
  valuePreviewsById,
}: LiveDictAreaSectionInput): LiveDictAreaRenderBoundaryInput {
  return {
    bgColor,
    canConnect: canEditStructure && !isSelectingParams,
    edgeInputParams,
    getParamEditorKind: (paramId: string) => {
      const editorKind = editorKindsById[paramId];
      if (!editorKind) {
        throw new Error(
          `Missing live dict-area editor kind for ${paramId} in ${sectionId}.`,
        );
      }
      return editorKind;
    },
    getParamDisplayName: (paramId: string) =>
      displayNamesById[paramId] ?? paramId,
    getParamValuePreview: (paramId: string) =>
      valuePreviewsById[paramId] ?? null,
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
