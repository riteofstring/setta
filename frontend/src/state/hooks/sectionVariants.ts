import _ from "lodash";
import {
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplWithTypeGuard,
} from "state/actions/sectionInfos";
import { useProjectState, ZustandProjectState } from "state/definitions";
import {
  BaseSectionImplUnion,
  isBaseParentSectionImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";

export function useListElementIdx(sectionId: string) {
  return useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    const { parentId } = impl;
    if (!parentId) {
      throw new Error();
    }
    const parentImpl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      parentId,
      isBaseParentSectionImpl,
    );
    return parentImpl.children.indexOf(sectionId);
  });
}

export function useSectionImplIsFrozen(sectionId: string) {
  return useProjectState(
    (x) => getCurrEffectiveSectionImpl(x, sectionId).isFrozen,
  );
}

export function useTextBlockTextAndEditability(sectionId: string) {
  return useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
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
  const impl = _impl ?? getCurrEffectiveSectionImpl(state, sectionId);
  if (impl.type !== SectionTypeEnum.TextBlock) {
    throw new Error();
  }
  return {
    format: impl.format,
    headingAsSectionName: impl.headingAsSectionName,
    text: impl.text,
  };
}
