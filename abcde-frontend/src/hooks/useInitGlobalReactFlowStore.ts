import { useReactFlowStore } from "models/reactFlowStore";
import { useEffect } from "react";
import { useStoreApi } from "reactflow";

export function useInitGlobalReactFlowStore() {
  const store = useStoreApi();
  useEffect(() => {
    useReactFlowStore.getState().setStore(store);
  }, []);
}
