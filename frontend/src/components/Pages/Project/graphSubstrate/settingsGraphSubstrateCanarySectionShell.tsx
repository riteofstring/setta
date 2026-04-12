import React, {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";

type SettingsGraphSubstrateCanarySectionShellProps = {
  children: ReactNode;
  finishSectionDrag: (
    event: ReactPointerEvent<HTMLDivElement>,
    persistLayout: boolean,
  ) => void;
  handleSectionPointerDown: (
    section: SettingsGraphSubstrateCanarySceneSection,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  handleSectionPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  isDragging: boolean;
  onHoveredSectionChange: (sectionId: string | null) => void;
  section: SettingsGraphSubstrateCanarySceneSection;
};

function _SettingsGraphSubstrateCanarySectionShell({
  children,
  finishSectionDrag,
  handleSectionPointerDown,
  handleSectionPointerMove,
  isDragging,
  onHoveredSectionChange,
  section,
}: SettingsGraphSubstrateCanarySectionShellProps) {
  let sectionCursor: CSSProperties["cursor"] = "grab";
  if (section.positionAndSizeLocked) {
    sectionCursor = "default";
  } else if (isDragging) {
    sectionCursor = "grabbing";
  }

  return (
    <div
      className="react-flow__node group/canary-section"
      style={{
        cursor: sectionCursor,
        touchAction: "none",
        position: "absolute",
        transform: `translate(${section.renderedPosition.x}px,${section.renderedPosition.y}px)`,
        transformOrigin: "0 0",
        pointerEvents: "all",
        visibility: "visible",
        zIndex: section.tempZIndex,
      }}
      data-id={section.sectionId}
      data-section-id={section.sectionId}
      data-dragging={isDragging ? "true" : "false"}
      data-testid="graph-substrate-canary-section"
      onPointerEnter={() => onHoveredSectionChange(section.sectionId)}
      onPointerLeave={() => onHoveredSectionChange(null)}
      onPointerDownCapture={(event) => handleSectionPointerDown(section, event)}
      onPointerMoveCapture={handleSectionPointerMove}
      onPointerUpCapture={(event) => finishSectionDrag(event, true)}
      onPointerCancelCapture={(event) => finishSectionDrag(event, false)}
    >
      {children}
    </div>
  );
}

export const SettingsGraphSubstrateCanarySectionShell = React.memo(
  _SettingsGraphSubstrateCanarySectionShell,
);
