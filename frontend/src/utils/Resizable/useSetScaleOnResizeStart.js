import { useState } from "react";
import { REACT_FLOW_STORE } from "utils/constants";

export function useSetScaleOnResizeStart() {
  const [scale, setScale] = useState(1);

  function onResizeStart() {
    setScale(REACT_FLOW_STORE.store.getState().transform[2]);
  }
  return { scale, onResizeStart };
}
