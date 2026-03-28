import { LiveDictAreaMount } from "./groupContainerLiveDictAreaMount";
import {
  useLiveDictAreaSectionContainerBoundary,
  type LiveDictAreaSectionContainerBoundaryInput,
} from "./groupContainerLiveDictAreaSectionContainerBoundary";

export type LiveDictAreaSectionContainerProps =
  LiveDictAreaSectionContainerBoundaryInput;

export function LiveDictAreaSectionContainer({
  bgColor,
  outerRef,
  sectionId,
  sectionTypeName,
}: LiveDictAreaSectionContainerProps) {
  const liveDictAreaMountBoundary = useLiveDictAreaSectionContainerBoundary({
    bgColor,
    outerRef,
    sectionId,
    sectionTypeName,
  });

  return (
    <LiveDictAreaMount {...liveDictAreaMountBoundary.liveDictAreaMountProps} />
  );
}
