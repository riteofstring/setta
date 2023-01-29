import { useGetSectionConfig } from "./useSectionConfig";
import { useGetAllCallables, useGetParamInfos } from "./useSectionContents";

export function useMinSectionHeight(sectionId) {
  const selectedItem = useGetSectionConfig(sectionId, "selectedItem");
  const hasTitle = true;
  const hasSearch = useGetAllCallables(sectionId).length > 0;
  const hasParam = useGetParamInfos(sectionId, selectedItem).length > 0;
  const hasKwargControl = true;

  return (
    (hasTitle ? 50 : 0) +
    (hasSearch ? 50 : 0) +
    (hasParam ? 50 : 0) +
    (hasKwargControl ? 50 : 0)
  );
}
