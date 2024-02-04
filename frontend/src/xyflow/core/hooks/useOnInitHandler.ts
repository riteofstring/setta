import { useEffect, useRef } from "react";
import { REACT_FLOW_STORE } from "utils/constants";
import useReactFlow from "./useReactFlow";

function useOnInitHandler() {
  const rfInstance = useReactFlow();
  const isInitialized = useRef<boolean>(false);

  useEffect(() => {
    if (!isInitialized.current && rfInstance.viewportInitialized) {
      REACT_FLOW_STORE.rf = rfInstance;
      isInitialized.current = true;
    }
  }, [rfInstance.viewportInitialized]);
}

export default useOnInitHandler;
