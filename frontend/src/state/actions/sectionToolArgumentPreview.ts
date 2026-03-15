import { type ZustandProjectState } from "state/definitions";
import { useToolArgumentPreview } from "state/stores/aiStores";
import {
  isBaseChildlessCodeObjImpl,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";
import {
  getEffectiveCodeObjImplIfPresent,
  getEffectiveSectionImplIfPresent,
} from "./sectionEffectiveImpls";

export function clearToolArgumentPreviewForProjectState(
  projectConfigId: string,
  projectState: ZustandProjectState,
): void {
  useToolArgumentPreview.setState((state) => {
    const previewState = state.byProjectConfigId[projectConfigId];
    if (!previewState) {
      return;
    }
    for (const [sectionId, entry] of Object.entries(
      previewState.previewCodeBySectionId,
    )) {
      const sectionImpl = getEffectiveSectionImplIfPresent(
        projectState,
        sectionId,
      );
      if (!sectionImpl || sectionImpl.type !== SectionTypeEnum.Code) {
        delete previewState.previewCodeBySectionId[sectionId];
        continue;
      }
      if (sectionImpl.code === entry.value) {
        delete previewState.previewCodeBySectionId[sectionId];
      }
    }
    for (const [sectionId, entry] of Object.entries(
      previewState.previewCallableNameBySectionId,
    )) {
      const sectionImpl = getEffectiveSectionImplIfPresent(
        projectState,
        sectionId,
      );
      if (!sectionImpl || !isBaseSectionWithParamsImpl(sectionImpl)) {
        delete previewState.previewCallableNameBySectionId[sectionId];
        continue;
      }
      const { callable } = sectionImpl;
      let canonicalName = "";
      if (callable) {
        const codeObj = projectState.codeObjs[callable];
        if (!codeObj) {
          delete previewState.previewCallableNameBySectionId[sectionId];
          continue;
        }
        canonicalName = codeObj.name;
      }
      if (canonicalName === entry.value) {
        delete previewState.previewCallableNameBySectionId[sectionId];
      }
    }
    for (const [sectionId, paramEntries] of Object.entries(
      previewState.previewParamValueBySectionAndParamId,
    )) {
      const sectionImpl = getEffectiveSectionImplIfPresent(
        projectState,
        sectionId,
      );
      if (!sectionImpl || !isBaseSectionWithParamsImpl(sectionImpl)) {
        delete previewState.previewParamValueBySectionAndParamId[sectionId];
        continue;
      }
      for (const [paramInfoId, entry] of Object.entries(paramEntries)) {
        const impl = getEffectiveCodeObjImplIfPresent(
          projectState,
          sectionImpl,
          paramInfoId,
        );
        if (!impl || !isBaseChildlessCodeObjImpl(impl)) {
          delete paramEntries[paramInfoId];
          continue;
        }
        if (impl.value === entry.value) {
          delete paramEntries[paramInfoId];
        }
      }
      if (Object.keys(paramEntries).length === 0) {
        delete previewState.previewParamValueBySectionAndParamId[sectionId];
      }
    }
    if (
      Object.keys(previewState.previewCodeBySectionId).length === 0 &&
      Object.keys(previewState.previewCallableNameBySectionId).length === 0 &&
      Object.keys(previewState.previewParamValueBySectionAndParamId).length ===
        0
    ) {
      delete state.byProjectConfigId[projectConfigId];
    }
  });
}
