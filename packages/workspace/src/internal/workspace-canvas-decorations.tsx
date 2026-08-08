import { Background, BackgroundVariant, MiniMap, useViewport, ViewportPortal } from "@xyflow/react";
import type { ReactNode } from "react";

import type { WorkspaceRootNode } from "./workspace-canvas-root-node.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import type {
  WorkspaceMinimapPlacement,
  WorkspaceOverlayPlacement,
} from "./workspace-react-contract.js";

function backgroundVariant(pattern: ResolvedWorkspaceGridOptions["pattern"]): BackgroundVariant {
  if (pattern === "cross") {
    return BackgroundVariant.Cross;
  }
  if (pattern === "lines") {
    return BackgroundVariant.Lines;
  }
  return BackgroundVariant.Dots;
}

function hasWorkspaceCanvasContent(value: ReactNode): boolean {
  return value !== null && value !== undefined && value !== false;
}

export function WorkspaceGridBackground({
  canvasId,
  gridOptions,
  snapGrid,
}: Readonly<{
  canvasId: string;
  gridOptions: ResolvedWorkspaceGridOptions;
  snapGrid: [number, number];
}>) {
  const { zoom } = useViewport();
  return (
    <div aria-hidden="true" className="setta-workspace__grid">
      <Background
        bgColor="var(--setta-workspace-canvas-background)"
        color="var(--setta-workspace-grid-color)"
        gap={snapGrid}
        id={`${canvasId}-grid`}
        lineWidth={gridOptions.markSize * zoom}
        size={gridOptions.markSize}
        variant={backgroundVariant(gridOptions.pattern)}
      />
    </div>
  );
}

export function WorkspaceCanvasAnnouncements({
  movement,
  selection,
}: Readonly<{
  movement: string;
  selection: string;
}>) {
  return (
    <>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-movement-announcement=""
      >
        {movement}
      </div>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-selection-announcement=""
      >
        {selection}
      </div>
    </>
  );
}

export function WorkspaceCanvasHostOverlay({ children }: Readonly<{ children: ReactNode }>) {
  if (!hasWorkspaceCanvasContent(children)) {
    return null;
  }
  return (
    <ViewportPortal>
      <div className="setta-workspace__host-overlay" data-workspace-overlay-placement="canvas">
        {children}
      </div>
    </ViewportPortal>
  );
}

export function WorkspaceCanvasEmptyPanel({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      className={`setta-workspace__empty-panel ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
      hidden={!hasWorkspaceCanvasContent(children)}
    >
      <div className="setta-workspace__empty">{children}</div>
    </div>
  );
}

export function WorkspaceFixedOverlay({
  children,
  placement,
}: Readonly<{
  children: ReactNode;
  placement: Exclude<WorkspaceOverlayPlacement, "canvas">;
}>) {
  if (!hasWorkspaceCanvasContent(children)) {
    return null;
  }
  return (
    <div
      className={`setta-workspace__overlay setta-workspace__overlay--${placement} ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
      data-workspace-overlay-placement={placement}
    >
      {children}
    </div>
  );
}

export function WorkspaceMinimap({
  ariaLabel,
  id,
  placement,
  visible,
}: Readonly<{
  ariaLabel: string;
  id: string;
  placement: WorkspaceMinimapPlacement;
  visible: boolean;
}>) {
  return (
    <div data-workspace-minimap-placement={placement} hidden={!visible} id={id}>
      {visible ? (
        <MiniMap<WorkspaceRootNode>
          ariaLabel={`${ariaLabel} minimap`}
          bgColor="var(--setta-workspace-minimap-background)"
          className={`setta-workspace__minimap ${WORKSPACE_NO_PAN_CLASS_NAME} ${WORKSPACE_NO_WHEEL_CLASS_NAME}`}
          maskColor="color-mix(in oklch, var(--setta-workspace-canvas-background) 72%, transparent)"
          maskStrokeColor="var(--setta-workspace-selection)"
          maskStrokeWidth={2}
          nodeBorderRadius={6}
          nodeColor={(node) =>
            node.data.section.presentation.accentColor ??
            "var(--setta-workspace-section-background)"
          }
          nodeStrokeColor="var(--setta-workspace-section-muted-text)"
          pannable={false}
          position={placement === "left" ? "bottom-left" : "bottom-right"}
          zoomable={false}
        />
      ) : null}
    </div>
  );
}
