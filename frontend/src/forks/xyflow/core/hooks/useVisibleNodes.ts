import { useCallback } from "react";
import { getNodes } from "state/actions/nodeInternals";
import { useNodeInternals } from "state/definitions";

function useVisibleNodes() {
  const nodes = useNodeInternals(useCallback((s) => getNodes(s), []));
  return nodes;
}

export default useVisibleNodes;
