import { useCallback } from "react";
import { useNodeInternals } from "state/definitions/nodeInternals";

function useVisibleNodes() {
  const nodes = useNodeInternals(useCallback((s) => s.getNodes(), []));
  return nodes;
}

export default useVisibleNodes;
