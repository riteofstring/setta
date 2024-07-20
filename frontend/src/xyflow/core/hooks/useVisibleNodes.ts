import { useNodeInternals } from "state/definitions/nodeInternals";
import { useCallback } from "react";

function useVisibleNodes() {
  const nodes = useNodeInternals(useCallback((s) => s.getNodes(), []));
  return nodes;
}

export default useVisibleNodes;
