import { createContext, useContext } from "react";

export type GraphSurfaceImplementation = "legacy-dom" | "canvas-shell-underlay";

const GraphSurfaceImplementationContext =
  createContext<GraphSurfaceImplementation>("legacy-dom");

export const GraphSurfaceImplementationProvider =
  GraphSurfaceImplementationContext.Provider;

export function useGraphSurfaceImplementation() {
  return useContext(GraphSurfaceImplementationContext);
}
