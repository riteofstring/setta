import { createContext, useContext } from "react";

export const NodeIdContext = createContext<string | null>(null);

export function useNodeId() {
  return useContext(NodeIdContext);
}
