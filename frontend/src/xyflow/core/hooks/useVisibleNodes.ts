import { useNodeInternals } from "models/info/nodeInternals";

function useVisibleNodes() {
  const nodes = useNodeInternals((s) => Array.from(s.x.values()));
  return nodes;
}

export default useVisibleNodes;
