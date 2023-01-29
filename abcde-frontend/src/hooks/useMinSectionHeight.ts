import { useGetSectionConfig } from "./useSectionConfig";
import { useGetAllCallables, useGetParamInfos } from "./useSectionContents";
import { useIsRoot } from "./useSectionType";

export function useMinSectionHeight(sectionId) {
  const selectedItem = useGetSectionConfig(sectionId, "selectedItem");
  const isRoot = useIsRoot(sectionId);
  const hasTitle = true;
  const hasSearch = useGetAllCallables(sectionId).length > 0 && !isRoot;
  const hasParam = useGetParamInfos(sectionId, selectedItem).length > 0;
  const hasKwargControl = true;

  return (
    (hasTitle ? 50 : 0) +
    (hasSearch ? 50 : 0) +
    (hasParam ? 50 : 0) +
    (hasKwargControl ? 50 : 0)
  );
}
