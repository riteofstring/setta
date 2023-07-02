import { useReactFlowStore } from "models/reactFlowStore";
import { useState } from "react";

export function useSetScaleOnResizeStart() {
  const [scale, setScale] = useState(1);

  function onResizeStart() {
    setScale(useReactFlowStore.getState().store.getState().transform[2]);
  }
  return { scale, onResizeStart };
}
