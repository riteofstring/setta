import { memo } from "react";
import AgenticEdgeRenderer from "./AgenticEdgeRenderer";
import EdgeRenderer from "./EdgeRenderer";
import NodeRenderer from "./NodeRenderer";
import SectionShellBackdropCanvas from "./SectionShellBackdropCanvas";
import StateMachineEdgeRenderer from "./StateMachineEdgeRenderer";

export type GraphSurfaceImplementation =
  | "legacy-dom"
  | "canvas-shell-underlay";

type GraphSurfaceProps = {
  readyToRender: boolean;
};

function getDefaultGraphSurfaceImplementation(): GraphSurfaceImplementation {
  return "canvas-shell-underlay";
}

function LegacyDomGraphSurface() {
  return (
    <>
      <EdgeRenderer />
      <AgenticEdgeRenderer />
      <StateMachineEdgeRenderer />
      <NodeRenderer />
    </>
  );
}

function CanvasShellUnderlayGraphSurface() {
  return (
    <>
      <SectionShellBackdropCanvas />
      <LegacyDomGraphSurface />
    </>
  );
}

function GraphSurface({ readyToRender }: GraphSurfaceProps) {
  if (!readyToRender) {
    return null;
  }

  const implementation = getDefaultGraphSurfaceImplementation();

  switch (implementation) {
    case "legacy-dom":
      return <LegacyDomGraphSurface />;
    case "canvas-shell-underlay":
      return <CanvasShellUnderlayGraphSurface />;
    default:
      return implementation satisfies never;
  }
}

GraphSurface.displayName = "GraphSurface";

export default memo(GraphSurface);
