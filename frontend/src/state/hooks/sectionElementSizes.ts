import _ from "lodash";
import {
  type SectionElementSize,
  useSectionElementSizeRegistry,
} from "state/definitions";

export type SectionElementSizes = Record<string, SectionElementSize>;

export function useSectionElementSizes(
  sectionIds: Array<string>,
): SectionElementSizes {
  return useSectionElementSizeRegistry((state) => {
    const nextSizes: SectionElementSizes = {};

    for (const sectionId of sectionIds) {
      const size = state[sectionId];
      if (size) {
        nextSizes[sectionId] = size;
      }
    }

    return nextSizes;
  }, _.isEqual);
}

export function measureSectionElementSize(
  element: HTMLElement,
): SectionElementSize | null {
  const width = element.offsetWidth;
  const height = element.offsetHeight;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}
