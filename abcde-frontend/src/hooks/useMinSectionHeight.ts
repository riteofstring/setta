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
  const hasKwargControl = !isRoot;

  return (
    (hasTitle ? 56 : 0) +
    (hasSearch ? 48 : 0) +
    (hasUnnestedParam ? 44 : 0) +
    (hasKwargControl ? 28 : 0)
  );
}
