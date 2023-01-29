import { useAreAllParamsNested } from "./useParamUIType";
import { useGetSectionConfig } from "./useSectionConfig";
import { useGetAllCallables, useGetParamInfos } from "./useSectionContents";
import { useIsRoot } from "./useSectionType";

export function useMinSectionHeight(sectionId) {
  const selectedItem = useGetSectionConfig(sectionId, "selectedItem");
  const isRoot = useIsRoot(sectionId);
  const hasTitle = true;
  const hasSearch = useGetAllCallables(sectionId).length > 0 && !isRoot;
  const paramInfos = useGetParamInfos(sectionId, selectedItem);
  const hasUnnestedParam = !useAreAllParamsNested(sectionId, paramInfos);
  const hasKwargControl = true;

  return (
    (hasTitle ? 50 : 0) +
    (hasSearch ? 50 : 0) +
    (hasUnnestedParam ? 50 : 0) +
    (hasKwargControl ? 50 : 0)
  );
}
