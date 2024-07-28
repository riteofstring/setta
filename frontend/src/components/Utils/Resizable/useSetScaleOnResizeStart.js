import { useReactFlow } from "forks/xyflow/core/store";
import { useState } from "react";

export function useSetScaleOnResizeStart() {
  const [scale, setScale] = useState(1);

  function onResizeStart() {
    setScale(useReactFlow.getState().transform[2]);
  }
  return { scale, onResizeStart };
}
