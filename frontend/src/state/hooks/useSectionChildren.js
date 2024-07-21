import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { useSectionInfos } from "state/definitions/sectionInfos";

export function useHasNested(sectionId) {
  return useSectionInfos((x) => x.x[sectionId].children?.length > 0);
}

export function useTempHasNested(sectionId) {
  return useDndChildren((x) => x.x[sectionId]?.length > 0);
}
