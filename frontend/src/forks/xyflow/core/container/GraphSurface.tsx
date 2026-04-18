import { memo } from "react";
import AgenticEdgeRenderer from "./AgenticEdgeRenderer";
import EdgeRenderer from "./EdgeRenderer";
import {
  GraphSurfaceImplementationProvider,
  type GraphSurfaceImplementation,
} from "./graphSurfaceImplementation";
import NodeRenderer from "./NodeRenderer";
import SectionShellBackdropCanvas from "./SectionShellBackdropCanvas";
import StateMachineEdgeRenderer from "./StateMachineEdgeRenderer";

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
  let surface: JSX.Element;

  switch (implementation) {
    case "legacy-dom":
      surface = <LegacyDomGraphSurface />;
      break;
    case "canvas-shell-underlay":
      surface = <CanvasShellUnderlayGraphSurface />;
      break;
    default:
      return implementation satisfies never;
  }

  return (
    <GraphSurfaceImplementationProvider value={implementation}>
      {surface}
    </GraphSurfaceImplementationProvider>
  );
}

GraphSurface.displayName = "GraphSurface";

export default memo(GraphSurface);
