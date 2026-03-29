import { CodeObjTypeEnum, type SectionTypeEnum } from "utils/generatedTypes";
import type { LiveDictAreaRenderBoundaryInput } from "./groupContainerLiveDictAreaRenderBoundary";
import type {
  ParamEditorKind,
  ParamValuePresentationKind,
} from "./paramEditorActivation";

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
  valuePresentationKindsById: Record<string, ParamValuePresentationKind>;
  valuePreviewsById: Record<string, string>;
  valueSwatchesById: Record<string, string>;
};

type LiveDictAreaColorChoicePreview = {
  color: string;
  description: string;
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

export function buildLiveDictAreaSectionValuePresentationKinds({
  getParamValuePresentationKind,
  requiredParamIdsToPaths,
  topLevelParamIds,
}: {
  getParamValuePresentationKind: (
    paramId: string,
  ) => ParamValuePresentationKind;
  requiredParamIdsToPaths: Record<string, string[]>;
  topLevelParamIds: string[];
}): Record<string, ParamValuePresentationKind> {
  const paramIds = collectLiveDictAreaParamIds({
    requiredParamIdsToPaths,
    topLevelParamIds,
  });
  const valuePresentationKindsById: Record<string, ParamValuePresentationKind> =
    {};

  for (const paramId of paramIds) {
    valuePresentationKindsById[paramId] =
      getParamValuePresentationKind(paramId);
  }

  return valuePresentationKindsById;
}

export function resolveLiveDictAreaValuePreview({
  codeObjType,
  colorChoices = [],
  value,
}: {
  codeObjType: CodeObjTypeEnum;
  colorChoices?: LiveDictAreaColorChoicePreview[];
  value: string;
}): string | null {
  if (codeObjType === CodeObjTypeEnum.PasswordParam) {
    return "\u2022\u2022\u2022\u2022\u2022\u2022";
  }

  if (codeObjType === CodeObjTypeEnum.ColorPickerParam) {
    const selectedColorChoice = resolveLiveDictAreaSelectedColorChoice({
      colorChoices,
      value,
    });

    if (selectedColorChoice) {
      return normalizeLiveDictAreaValueText(selectedColorChoice.description);
    }
  }

  return normalizeLiveDictAreaValueText(value);
}

export function resolveLiveDictAreaValueSwatch({
  codeObjType,
  colorChoices = [],
  value,
}: {
  codeObjType: CodeObjTypeEnum;
  colorChoices?: LiveDictAreaColorChoicePreview[];
  value: string;
}): string | null {
  if (codeObjType !== CodeObjTypeEnum.ColorPickerParam) {
    return null;
  }

  const selectedColorChoice = resolveLiveDictAreaSelectedColorChoice({
    colorChoices,
    value,
  });
  if (!selectedColorChoice) {
    return null;
  }

  return normalizeLiveDictAreaValueText(selectedColorChoice.color);
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

export function buildLiveDictAreaSectionValueSwatches({
  getParamValueSwatch,
  requiredParamIdsToPaths,
  topLevelParamIds,
}: {
  getParamValueSwatch: (paramId: string) => string | null;
  requiredParamIdsToPaths: Record<string, string[]>;
  topLevelParamIds: string[];
}): Record<string, string> {
  const paramIds = collectLiveDictAreaParamIds({
    requiredParamIdsToPaths,
    topLevelParamIds,
  });
  const valueSwatchesById: Record<string, string> = {};

  for (const paramId of paramIds) {
    const valueSwatch = getParamValueSwatch(paramId);
    if (valueSwatch !== null) {
      valueSwatchesById[paramId] = valueSwatch;
    }
  }

  return valueSwatchesById;
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
  valuePresentationKindsById,
  valuePreviewsById,
  valueSwatchesById,
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
    getParamValuePresentationKind: (paramId: string) => {
      const valuePresentationKind = valuePresentationKindsById[paramId];
      if (!valuePresentationKind) {
        throw new Error(
          `Missing live dict-area value presentation kind for ${paramId} in ${sectionId}.`,
        );
      }
      return valuePresentationKind;
    },
    getParamValuePreview: (paramId: string) =>
      valuePreviewsById[paramId] ?? null,
    getParamValueSwatch: (paramId: string) =>
      valueSwatchesById[paramId] ?? null,
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

function normalizeLiveDictAreaValueText(value: string): string | null {
  const normalizedValue = value.replace(/\s+/g, " ").trim();

  return normalizedValue.length === 0 ? null : normalizedValue;
}

function resolveLiveDictAreaSelectedColorChoice({
  colorChoices,
  value,
}: {
  colorChoices: LiveDictAreaColorChoicePreview[];
  value: string;
}): LiveDictAreaColorChoicePreview | null {
  if (colorChoices.length === 0) {
    return null;
  }

  return (
    colorChoices.find((colorChoice) => colorChoice.color === value) ?? {
      color: colorChoices[0].color,
      description: colorChoices[0].description,
    }
  );
}
