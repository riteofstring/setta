import { createContext, useContext } from "react";

const NodeIdContext = createContext<string | null>(null);

export const NodeIdProvider = NodeIdContext.Provider;

export function useNodeId() {
  return useContext(NodeIdContext);
}
