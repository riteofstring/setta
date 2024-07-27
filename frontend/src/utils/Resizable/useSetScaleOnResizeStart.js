import { useState } from "react";
import { useReactFlow } from "xyflow/core/store";

export function useSetScaleOnResizeStart() {
  const [scale, setScale] = useState(1);

  function onResizeStart() {
    setScale(useReactFlow.getState().transform[2]);
  }
  return { scale, onResizeStart };
}
