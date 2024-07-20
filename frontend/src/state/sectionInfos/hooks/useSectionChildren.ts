import { useSectionInfos } from "state/sectionInfos/definition";
import { useDndChildren } from "utils/DNDSortable/dndChildren";

export function useHasNested(sectionId: string) {
  return useSectionInfos((x) => x.x[sectionId].children?.length > 0);
}

export function useTempHasNested(sectionId: string) {
  return useDndChildren((x) => x.x[sectionId]?.length > 0);
}
