import { useState } from "react";
import { useStoreApi } from "react-flow-renderer";

export function useSetScaleOnResizeStart() {
  const rfStore = useStoreApi();
  const [scale, setScale] = useState(1);

  function onResizeStart() {
    setScale(rfStore.getState().transform[2]);
  }
  return { scale, onResizeStart };
}
