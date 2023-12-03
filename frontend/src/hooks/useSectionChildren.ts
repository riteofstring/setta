import { useSectionInfos } from "models/info/sectionInfos";

export function useHasNested(sectionId: string) {
  return useSectionInfos((x) => x.x[sectionId].currChildren?.length > 0);
}
