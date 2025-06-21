import _ from "lodash";
import {
  getDisplayedSectionVariant,
  getSectionImpl,
  getSectionVariant,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";

export function useGetParamEnteredValue(sectionId, paramInfoId) {
  return useProjectState((x) => {
    const vals = getDisplayedSectionVariant(sectionId, x).values;
    if (paramInfoId in vals) {
      return vals[paramInfoId].value;
    }
    return createEVEntry().value;
  }, _.isEqual);
}

export function useListElementIdx(sectionId) {
  return useProjectState((x) => {
    const parentId = x.sections[sectionId].parentId;
    return getDisplayedSectionVariant(parentId).children.indexOf(sectionId);
  });
}

export function useSectionVariantIsFrozen(sectionId) {
  return useProjectState((x) => getSectionVariant(sectionId, x).isFrozen);
}

export function useTextBlockDescriptionAndEditability(sectionId) {
  return useProjectState((x) => {
    const impl = getSectionImpl(x, sectionId);
    return {
      ...getTextBlockDescription(sectionId, x),
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);
}

export function getTextBlockDescription(sectionId, state, _impl = null) {
  const impl = getSectionImpl(state, sectionId, _impl);
  if (impl.type !== SectionTypeEnum.TextBlock) {
    throw new Error();
  }
  return {
    renderMarkdown: impl.renderMarkdown,
    headingAsSectionName: impl.headingAsSectionName,
    description: impl.description,
  };
}
