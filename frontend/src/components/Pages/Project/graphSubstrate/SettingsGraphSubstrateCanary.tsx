import type { CSSProperties } from "react";
import { SettingsGraphSubstrateCanaryBackground } from "./settingsGraphSubstrateCanaryBackground";
import { useSettingsGraphSubstrateCanaryController } from "./settingsGraphSubstrateCanaryController";
import { SettingsGraphSubstrateCanarySectionShellPixiLayer } from "./settingsGraphSubstrateCanarySectionShellPixiLayer";
import { SettingsGraphSubstrateCanarySectionsLayer } from "./settingsGraphSubstrateCanarySectionsLayer";

const ROOT_STYLE: CSSProperties = {
  inset: 0,
  overflow: "hidden",
  position: "absolute",
  userSelect: "none",
  overflowAnchor: "none",
};

export function SettingsGraphSubstrateCanary() {
  const controller = useSettingsGraphSubstrateCanaryController();

  return (
    <div
      ref={controller.rootRef}
      style={{
        ...ROOT_STYLE,
        cursor: controller.rootCursor,
      }}
      className="react-flow setta-light dark:setta-dark"
      data-tab-scope="canvas"
      data-testid="graph-substrate-canary"
      onClick={controller.handlePaneClick}
      onPointerDown={controller.handlePanePointerDown}
      onPointerMove={controller.handlePanePointerMove}
      onPointerUp={controller.finishPanePan}
      onPointerCancel={controller.finishPanePan}
      onWheel={controller.handlePaneWheel}
    >
      {controller.shouldShowGridLines && (
        <SettingsGraphSubstrateCanaryBackground
          viewport={controller.resolvedViewport}
        />
      )}
      {controller.sceneSections.length > 0 ? (
        <SettingsGraphSubstrateCanarySectionShellPixiLayer
          sceneSections={controller.sceneSections}
          viewport={controller.resolvedViewport}
        />
      ) : null}
      <div
        className="react-flow__viewport"
        data-testid="graph-substrate-canary-viewport"
        style={{
          inset: 0,
          pointerEvents: "none",
          position: "absolute",
          transform: controller.viewportTransform,
          transformOrigin: "0 0",
          zIndex: 2,
        }}
      >
        {controller.sceneSections.length > 0 ? (
          <SettingsGraphSubstrateCanarySectionsLayer
            draggingSectionId={controller.draggingSectionId}
            sceneSections={controller.sceneSections}
            sectionDragController={controller.sectionDragController}
          />
        ) : (
          <div
            className="flex h-full items-center justify-center text-xs text-setta-500 dark:text-setta-400"
            data-testid="graph-substrate-canary-empty"
          >
            No visible settings sections available for the graph substrate
            canary.
          </div>
        )}
      </div>
    </div>
  );
}
