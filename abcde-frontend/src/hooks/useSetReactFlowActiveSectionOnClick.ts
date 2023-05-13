import { useStoreApi } from "react-flow-renderer";
import { getHighestAncestor } from "thunks/sections/sectionSizes";

export function useSetReactFlowActiveSectionOnClick(sectionId) {
  const store = useStoreApi();

  return () => {
    const topMostAncestor = getHighestAncestor(sectionId);
    store.setState((x) => {
      x.addSelectedNodes([topMostAncestor]);
      return x;
    });
  };
}
