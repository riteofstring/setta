import {
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrShownParamIds,
  getParamDisplayName,
} from "state/actions/sectionInfos";
import { paramNameFromPathArray } from "state/actions/sections/sectionContents";
import type {
  ToolArgumentPreviewEntry,
  ZustandProjectState,
} from "state/definitions";
import { C } from "utils/c";
import {
  isBaseChildlessCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";
import {
  buildLiveDictAreaSectionDisplayNames,
  buildLiveDictAreaSectionEditorKinds,
  buildLiveDictAreaSectionValuePreviews,
  resolveLiveDictAreaValuePreview,
  type LiveDictAreaSectionInput,
} from "./groupContainerLiveDictAreaSectionInput";
import { resolveParamEditorKindFromCodeObjImpl } from "./paramEditorActivation";

export type LiveDictAreaSectionState = Pick<
  LiveDictAreaSectionInput,
  | "displayNamesById"
  | "editorKindsById"
  | "edgeInputParams"
  | "edgeInputPorts"
  | "edgeOutputPorts"
  | "hideUnpinnedParams"
  | "paramFilter"
  | "pinnedRequiredParamIdsToPaths"
  | "pinnedTopLevelParamIds"
  | "positionAndSizeLocked"
  | "selectedParamIds"
  | "styleColor"
  | "unpinnedRequiredParamIdsToPaths"
  | "unpinnedTopLevelParamIds"
  | "valuePreviewsById"
>;

type BuildLiveDictAreaSectionStateInput = {
  previewParamEntriesById?: Record<string, ToolArgumentPreviewEntry> | null;
  sectionId: string;
  state: ZustandProjectState;
};

export function buildLiveDictAreaSectionState({
  previewParamEntriesById = null,
  sectionId,
  state,
}: BuildLiveDictAreaSectionStateInput): LiveDictAreaSectionState {
  const impl = getCurrEffectiveSectionImplWithTypeGuard(
    state,
    sectionId,
    isBaseSectionWithParamsImpl,
  );
  const pinned = getCurrShownParamIds(state, sectionId, true, true);
  const unpinned = getCurrShownParamIds(state, sectionId, false, true);
  const requiredParamIdsToPaths = {
    ...pinned.requiredParamIdsToPaths,
    ...unpinned.requiredParamIdsToPaths,
  };
  const topLevelParamIds = [
    ...pinned.topLevelParamIds,
    ...unpinned.topLevelParamIds,
  ];

  return {
    displayNamesById: buildLiveDictAreaSectionDisplayNames({
      getParamDisplayName: (paramId: string) =>
        getParamDisplayName(state, sectionId, paramId),
      requiredParamIdsToPaths,
      topLevelParamIds,
    }),
    editorKindsById: buildLiveDictAreaSectionEditorKinds({
      getParamEditorKind: (paramId: string) =>
        resolveParamEditorKindFromCodeObjImpl(
          getCurrEffectiveCodeObjImpl(state, sectionId, paramId),
        ),
      requiredParamIdsToPaths,
      topLevelParamIds,
    }),
    valuePreviewsById: buildLiveDictAreaSectionValuePreviews({
      getParamValuePreview: (paramId: string) => {
        const codeObjImpl = getCurrEffectiveCodeObjImpl(
          state,
          sectionId,
          paramId,
          true,
        );
        if (!isBaseChildlessCodeObjImpl(codeObjImpl)) {
          return null;
        }

        return resolveLiveDictAreaValuePreview({
          codeObjType: codeObjImpl.type,
          value: previewParamEntriesById?.[paramId]?.value ?? codeObjImpl.value,
        });
      },
      requiredParamIdsToPaths,
      topLevelParamIds,
    }),
    edgeInputParams: impl.edgeInputParams,
    edgeInputPorts: impl.edgeInputParams.map((paramId) => {
      const path = requiredParamIdsToPaths[paramId];
      const rawLabel = path
        ? paramNameFromPathArray(state, sectionId, path)
        : getParamDisplayName(state, sectionId, paramId);
      const label = rawLabel.trim().length === 0 ? "(unnamed)" : rawLabel;

      return { id: paramId, label };
    }),
    edgeOutputPorts: impl.edgeOutputPorts.map((port) => ({
      id: port.id,
      label:
        port.accessor.trim() === "" ? C.EDGE_OUTPUT_BASE_LABEL : port.accessor,
    })),
    hideUnpinnedParams: impl.hideUnpinnedParams,
    paramFilter: impl.paramFilter,
    pinnedRequiredParamIdsToPaths: pinned.requiredParamIdsToPaths,
    pinnedTopLevelParamIds: pinned.topLevelParamIds,
    positionAndSizeLocked: impl.positionAndSizeLocked,
    selectedParamIds: impl.selectedParams ?? [],
    styleColor: impl.styleColor ?? null,
    unpinnedRequiredParamIdsToPaths: unpinned.requiredParamIdsToPaths,
    unpinnedTopLevelParamIds: unpinned.topLevelParamIds,
  };
}
