import _ from "lodash";
import {
  getDisplayedSectionVariant,
  getEffectiveSectionImpl,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { isBaseParentSectionImpl, SectionTypeEnum } from "utils/generatedTypes";

export function useGetParamEnteredValue(sectionId, paramInfoId) {
  return useProjectState((x) => {
    const vals = getDisplayedSectionVariant(sectionId, x).values;
    if (paramInfoId in vals) {
      return vals[paramInfoId].value;
    }
    return createEVEntry().value;
  }, _.isEqual);
}

export function useListElementIdx(sectionId: string) {
  return useProjectState((x) => {
    const impl = getEffectiveSectionImpl(x, sectionId);
    const { parentId } = impl;
    if (!parentId) {
      throw new Error();
    }
    const parentImpl = getEffectiveSectionImpl(x, parentId);
    if (!isBaseParentSectionImpl(parentImpl)) {
      throw new Error();
    }
    return parentImpl.children.indexOf(sectionId);
  });
}

export function useSectionImplIsFrozen(sectionId: string) {
  return useProjectState((x) => getEffectiveSectionImpl(x, sectionId).isFrozen);
}

export function useTextBlockDescriptionAndEditability(sectionId) {
  return useProjectState((x) => {
    const impl = getEffectiveSectionImpl(x, sectionId);
    return {
      ...getTextBlockDescription(sectionId, x, impl),
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);
}

export function getTextBlockDescription(sectionId, state, _impl = null) {
  const impl = getEffectiveSectionImpl(state, sectionId, _impl);
  if (impl.type !== SectionTypeEnum.TextBlock) {
    throw new Error();
  }
  return {
    renderMarkdown: impl.renderMarkdown,
    headingAsSectionName: impl.headingAsSectionName,
    description: impl.description,
  };
}
