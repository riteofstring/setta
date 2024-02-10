import { useEffect, useRef } from "react";
import { REACT_FLOW_STORE } from "utils/constants";
import useViewportHelper from "./useViewportHelper";

function useOnInitHandler() {
  const rfInstance = useViewportHelper();
  const isInitialized = useRef<boolean>(false);

  useEffect(() => {
    if (!isInitialized.current && rfInstance.viewportInitialized) {
      REACT_FLOW_STORE.rf = rfInstance;
      isInitialized.current = true;
    }
  }, [rfInstance.viewportInitialized]);
}

export default useOnInitHandler;
