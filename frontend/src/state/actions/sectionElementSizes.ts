import {
  type SectionElementSize,
  useSectionElementSizeRegistry,
} from "state/definitions";

export function setSectionElementSize({
  sectionId,
  size,
}: {
  sectionId: string;
  size: SectionElementSize;
}) {
  useSectionElementSizeRegistry.setState((currentSizes) => {
    const currentSize = currentSizes[sectionId];
    if (
      currentSize?.width === size.width &&
      currentSize.height === size.height
    ) {
      return currentSizes;
    }

    return {
      ...currentSizes,
      [sectionId]: size,
    };
  });
}

export function deleteSectionElementSize(sectionId: string) {
  useSectionElementSizeRegistry.setState((currentSizes) => {
    if (!(sectionId in currentSizes)) {
      return currentSizes;
    }

    const nextSizes = { ...currentSizes };
    delete nextSizes[sectionId];
    return nextSizes;
  });
}
