import { useEffect } from "react";
import { useStoreApi } from "reactflow";
import { REACT_FLOW_STORE } from "utils/constants";

export function useInitGlobalReactFlowStore() {
  const store = useStoreApi();
  useEffect(() => {
    REACT_FLOW_STORE.store = store;
  }, []);
}
