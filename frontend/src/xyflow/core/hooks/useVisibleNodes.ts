import { useCallback } from "react";

import { useStore } from "../hooks/useStore";
import type { ReactFlowState } from "../types";

function useVisibleNodes() {
  const nodes = useStore(useCallback((s: ReactFlowState) => s.getNodes(), []));
  return nodes;
}

export default useVisibleNodes;
