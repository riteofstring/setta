import {
  Background,
  BackgroundVariant,
  MiniMap,
  useViewport,
  ViewportPortal,
  type MiniMapProps,
} from "@xyflow/react";
import { useCallback, useRef, useSyncExternalStore, type ReactNode } from "react";

import type { WorkspaceRootNode } from "./workspace-canvas-root-node.js";
import type { WorkspaceInteractionActivationStore } from "./workspace-interaction-activation.js";
import {
  WORKSPACE_NO_PAN_CLASS_NAME,
  WORKSPACE_NO_WHEEL_CLASS_NAME,
} from "./workspace-interaction-boundary.js";
import type { ResolvedWorkspaceGridOptions } from "./workspace-preferences.js";
import type {
  WorkspaceMinimapPlacement,
  WorkspaceOverlayPlacement,
} from "./workspace-react-contract.js";
import type { WorkspaceSelectionStore } from "./workspace-selection-store.js";

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

/**
 * Selection announcements publish through the selection store inside the
 * pointer-down dispatch, so this live region subscribes on its own and a
 * selection commit rerenders only this div.
 */
function WorkspaceSelectionAnnouncement({
  selectionStore,
}: Readonly<{ selectionStore: WorkspaceSelectionStore }>) {
  const announcementSnapshot = useCallback(
    () => selectionStore.getSnapshot().announcement,
    [selectionStore],
  );
  const announcement = useSyncExternalStore(
    selectionStore.subscribe,
    announcementSnapshot,
    announcementSnapshot,
  );
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="setta-workspace__visually-hidden"
      data-workspace-selection-announcement=""
    >
      {announcement}
    </div>
  );
}

/**
 * Structural-movement announcements publish through the interaction
 * activation store (deferred to the broadcast frame on starts, synchronous on
 * finishes), so this live region subscribes on its own and an ownership
 * transition rerenders only this div.
 */
function WorkspaceStructureMovementAnnouncement({
  interactionActivation,
}: Readonly<{ interactionActivation: WorkspaceInteractionActivationStore }>) {
  const announcement = useSyncExternalStore(
    interactionActivation.subscribe,
    interactionActivation.getAnnouncement,
    interactionActivation.getAnnouncement,
  );
  return (
    <div
      aria-atomic="true"
      aria-live="polite"
      className="setta-workspace__visually-hidden"
      data-workspace-structure-movement-announcement=""
    >
      {announcement}
    </div>
  );
}

export function WorkspaceCanvasAnnouncements({
  clipboard,
  creation,
  containerLayout,
  containerOrientation,
  containerPositioning,
  externalDrop,
  history,
  interactionActivation,
  movement,
  selectionStore,
  selectionAction,
  sectionState,
  sizing,
}: Readonly<{
  clipboard: string;
  creation: string;
  containerLayout: string;
  containerOrientation: string;
  containerPositioning: string;
  externalDrop: string;
  history: string;
  interactionActivation: WorkspaceInteractionActivationStore;
  movement: string;
  selectionStore: WorkspaceSelectionStore;
  selectionAction: string;
  sectionState: string;
  sizing: string;
}>) {
  return (
    <>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-clipboard-announcement=""
      >
        {clipboard}
      </div>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-container-layout-announcement=""
      >
        {containerLayout}
      </div>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-container-orientation-announcement=""
      >
        {containerOrientation}
      </div>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-container-positioning-announcement=""
      >
        {containerPositioning}
      </div>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-creation-announcement=""
      >
        {creation}
      </div>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-history-announcement=""
      >
        {history}
      </div>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-external-drop-announcement=""
      >
        {externalDrop}
      </div>
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
        data-workspace-section-state-announcement=""
      >
        {sectionState}
      </div>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-sizing-announcement=""
      >
        {sizing}
      </div>
      <WorkspaceSelectionAnnouncement selectionStore={selectionStore} />
      <div
        aria-atomic="true"
        aria-live="polite"
        className="setta-workspace__visually-hidden"
        data-workspace-selection-action-announcement=""
      >
        {selectionAction}
      </div>
      <WorkspaceStructureMovementAnnouncement interactionActivation={interactionActivation} />
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
  interactive,
  id,
  onPointerInteractionStart,
  onPointNavigate,
  onSectionNavigate,
  placement,
  visible,
}: Readonly<{
  ariaLabel: string;
  interactive: boolean;
  id: string;
  onPointerInteractionStart(): void;
  onPointNavigate(point: Readonly<{ x: number; y: number }>): void;
  onSectionNavigate(sectionId: string): void;
  placement: WorkspaceMinimapPlacement;
  visible: boolean;
}>) {
  const navigationRef = useRef({ interactive, onPointNavigate, onSectionNavigate });
  navigationRef.current = { interactive, onPointNavigate, onSectionNavigate };
  const handlePointNavigate = useCallback<NonNullable<MiniMapProps<WorkspaceRootNode>["onClick"]>>(
    (_event, point) => {
      if (navigationRef.current.interactive) {
        navigationRef.current.onPointNavigate(point);
      }
    },
    [],
  );
  const handleSectionNavigate = useCallback<
    NonNullable<MiniMapProps<WorkspaceRootNode>["onNodeClick"]>
  >((event, node) => {
    if (navigationRef.current.interactive) {
      event.stopPropagation();
      navigationRef.current.onSectionNavigate(node.id);
    }
  }, []);
  return (
    <div
      data-workspace-minimap-interactive={interactive ? "true" : "false"}
      data-workspace-minimap-placement={placement}
      hidden={!visible}
      id={id}
      onPointerDownCapture={interactive ? onPointerInteractionStart : undefined}
    >
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
          onClick={handlePointNavigate}
          onNodeClick={handleSectionNavigate}
          pannable={interactive}
          position={placement === "left" ? "bottom-left" : "bottom-right"}
          zoomable={false}
        />
      ) : null}
    </div>
  );
}
