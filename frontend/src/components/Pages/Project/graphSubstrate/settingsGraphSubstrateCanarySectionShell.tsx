import React, {
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";

type SettingsGraphSubstrateCanarySectionShellProps = {
  children: ReactNode;
  draggingSectionId: string | null;
  finishSectionDrag: (
    event: ReactPointerEvent<HTMLDivElement>,
    persistLayout: boolean,
  ) => void;
  handleSectionPointerDown: (
    section: SettingsGraphSubstrateCanarySceneSection,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  handleSectionPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onHoveredSectionChange: (sectionId: string | null) => void;
  section: SettingsGraphSubstrateCanarySceneSection;
};

function _SettingsGraphSubstrateCanarySectionShell({
  children,
  draggingSectionId,
  finishSectionDrag,
  handleSectionPointerDown,
  handleSectionPointerMove,
  onHoveredSectionChange,
  section,
}: SettingsGraphSubstrateCanarySectionShellProps) {
  let sectionCursor: CSSProperties["cursor"] = "grab";
  if (section.positionAndSizeLocked) {
    sectionCursor = "default";
  } else if (draggingSectionId === section.sectionId) {
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
      data-dragging={draggingSectionId === section.sectionId ? "true" : "false"}
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
