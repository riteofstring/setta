import { useEffect, useRef } from "react";
import { REACT_FLOW_STORE } from "utils/constants";
import useReactFlow from "./useReactFlow";
import { useStoreApi } from "./useStore";

function useOnInitHandler() {
  const rfInstance = useReactFlow();
  const store = useStoreApi();
  const isInitialized = useRef<boolean>(false);

  useEffect(() => {
    if (!isInitialized.current && rfInstance.viewportInitialized) {
      REACT_FLOW_STORE.rf = rfInstance;
      REACT_FLOW_STORE.store = store;
      isInitialized.current = true;
    }
  }, [rfInstance.viewportInitialized]);
}

export default useOnInitHandler;
