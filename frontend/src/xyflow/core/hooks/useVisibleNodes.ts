import { useNodeInternals } from "models/info/nodeInternals";
import { useCallback } from "react";

function useVisibleNodes() {
  const nodes = useNodeInternals(useCallback((s) => s.getNodes(), []));
  return nodes;
}

export default useVisibleNodes;
