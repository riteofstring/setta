import { useStoreApi } from "react-flow-renderer";
import { useIsTopLevelSection } from "./useProjectConfig";

// TODO: make this work for nested sections
export function useSetReactFlowActiveSectionOnClick(sectionId) {
  const store = useStoreApi();
  const isTopLevel = useIsTopLevelSection(sectionId);
  return () =>
    store.setState((x) => {
      isTopLevel && x.addSelectedNodes([sectionId]);
      return x;
    });
}
