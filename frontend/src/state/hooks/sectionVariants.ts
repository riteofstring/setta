import _ from "lodash";
import { getEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState, ZustandProjectState } from "state/definitions";
import {
  BaseSectionImplUnion,
  isBaseParentSectionImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";

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

export function useTextBlockTextAndEditability(sectionId: string) {
  return useProjectState((x) => {
    const impl = getEffectiveSectionImpl(x, sectionId);
    return {
      ...getTextBlockText(sectionId, x, impl),
      isFrozen: impl.isFrozen,
    };
  }, _.isEqual);
}

export function getTextBlockText(
  sectionId: string,
  state: ZustandProjectState,
  _impl: BaseSectionImplUnion | null = null,
) {
  const impl = _impl ?? getEffectiveSectionImpl(state, sectionId);
  if (impl.type !== SectionTypeEnum.TextBlock) {
    throw new Error();
  }
  return {
    format: impl.format,
    headingAsSectionName: impl.headingAsSectionName,
    text: impl.text,
  };
}
