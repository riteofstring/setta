import { LiveDictAreaSection } from "./groupContainerLiveDictAreaSection";
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
  const liveDictAreaSectionProps = useLiveDictAreaSectionContainerBoundary({
    bgColor,
    outerRef,
    sectionId,
    sectionTypeName,
  });

  return <LiveDictAreaSection {...liveDictAreaSectionProps} />;
}
