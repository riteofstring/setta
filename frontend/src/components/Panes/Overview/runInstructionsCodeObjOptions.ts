import {
  getCurrEffectiveCodeObjImplIfPresent,
  getCurrEffectiveSectionImpl,
} from "state/actions/sectionInfos";
import { type ZustandProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  SectionTypeEnum,
  isBaseSectionWithParamsImpl,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";

import { type RunInstructionsCodeObjOption } from "./RunInstructionsCodegenPolicy";

function getSectionCodeObjIds(sectionImpl: BaseSectionImplUnion): string[] {
  if (isBaseSectionWithParamsImpl(sectionImpl)) {
    return Object.keys(sectionImpl.codeObjVariantMap);
  }
  if (
    sectionImpl.type === SectionTypeEnum.MetaControl &&
    sectionImpl.metaControlParamId
  ) {
    return [sectionImpl.metaControlParamId];
  }
  return [];
}

function buildCodeObjOption(
  state: ZustandProjectState,
  sectionId: string,
  sectionName: string,
  codeObjId: string,
): RunInstructionsCodeObjOption | null {
  const codeObjCore = state.codeObjs[codeObjId];
  if (!codeObjCore) {
    return null;
  }
  const impl = getCurrEffectiveCodeObjImplIfPresent(
    state,
    sectionId,
    codeObjId,
  );
  if (!impl || impl.type === CodeObjTypeEnum.CodeCallable) {
    return null;
  }
  return {
    id: codeObjId,
    name: codeObjCore.name,
    type: impl.type,
    sectionName,
    label: `${sectionName} / ${codeObjCore.name}`,
  };
}

export function getRunInstructionsCodeObjOptions(
  state: ZustandProjectState,
): RunInstructionsCodeObjOption[] {
  const outputList: Array<RunInstructionsCodeObjOption> = [];
  const seen = new Set<string>();
  for (const [sectionId, section] of Object.entries(state.sections)) {
    const sectionImpl = getCurrEffectiveSectionImpl(state, sectionId);
    for (const codeObjId of getSectionCodeObjIds(sectionImpl)) {
      if (seen.has(codeObjId)) {
        continue;
      }
      const option = buildCodeObjOption(
        state,
        sectionId,
        section.name,
        codeObjId,
      );
      if (!option) {
        continue;
      }
      outputList.push(option);
      seen.add(codeObjId);
    }
  }
  outputList.sort((a, b) => a.label.localeCompare(b.label));
  return outputList;
}
