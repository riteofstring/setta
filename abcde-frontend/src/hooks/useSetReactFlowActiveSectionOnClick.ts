import { useStoreApi } from "react-flow-renderer";

export function useSetReactFlowActiveSectionOnClick(sectionId) {
  const store = useStoreApi();
  return () =>
    store.setState((x) => {
      x.addSelectedNodes([sectionId]);
    });
}
