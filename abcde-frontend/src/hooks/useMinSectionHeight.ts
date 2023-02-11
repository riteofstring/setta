import { useAreAllParamsNested } from "./useParamUIType";
import {
  useGetAllCallables,
  useGetCurrObjParamKwargInfos,
} from "./useSectionContents";
import { useIsRoot } from "./useSectionType";

export function useMinSectionHeight(sectionId) {
  const isRoot = useIsRoot(sectionId);
  const hasTitle = true;
  const hasSearch = useGetAllCallables(sectionId).length > 0 && !isRoot;
  const paramsAndKwargs = useGetCurrObjParamKwargInfos(sectionId);
  const hasUnnestedParam = !useAreAllParamsNested(sectionId, paramsAndKwargs);
  const hasKwargControl = !isRoot;

  return (
    (hasTitle ? 56 : 0) +
    (hasSearch ? 48 : 0) +
    (hasUnnestedParam ? 52 : 0) +
    (hasKwargControl ? 34 : 0)
    // (hasInfo ? 64 : 0)
  );
}
