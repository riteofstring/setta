import _ from "lodash";
import {
  getDisplayedSectionVariant,
  getSectionVariant,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { createEVEntry } from "utils/generatedTypes";

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
    return {
      ...getTextBlockDescription(sectionId, x),
      variantIsFrozen: getSectionVariant(sectionId, x).isFrozen,
    };
  }, _.isEqual);
}

export function getTextBlockDescription(sectionId, state) {
  return {
    renderMarkdown: state.sections[sectionId].renderMarkdown,
    headingAsSectionName: state.sections[sectionId].headingAsSectionName,
    description: getDisplayedSectionVariant(sectionId, state).description,
  };
}
