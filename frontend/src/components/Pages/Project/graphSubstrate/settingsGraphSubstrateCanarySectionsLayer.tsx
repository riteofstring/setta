import { SectionContainer } from "components/Section/Container/SectionContainer";
import React, {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import type { SettingsGraphSubstrateCanarySectionDragController } from "./settingsGraphSubstrateCanarySectionDragController";

type SettingsGraphSubstrateCanarySectionsLayerProps = {
  draggingSectionId: string | null;
  sceneSections: Array<SettingsGraphSubstrateCanarySceneSection>;
  sectionDragController: SettingsGraphSubstrateCanarySectionDragController;
};

function _SettingsGraphSubstrateCanarySectionsLayer({
  draggingSectionId,
  sceneSections,
  sectionDragController,
}: SettingsGraphSubstrateCanarySectionsLayerProps) {
  function handleSectionPointerDown(
    section: SettingsGraphSubstrateCanarySceneSection,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (
      !sectionDragController.handleSectionPointerDown({
        button: event.button,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        section,
        target: event.target,
      })
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSectionPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !sectionDragController.handleSectionPointerMove({
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
      })
    ) {
      return;
    }
    event.preventDefault();
  }

  function finishSectionDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    persistLayout: boolean,
  ) {
    if (
      !sectionDragController.finishSectionDrag({
        persistLayout,
        pointerId: event.pointerId,
      })
    ) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <>
      {sceneSections.map((section) => {
        let sectionCursor: CSSProperties["cursor"] = "grab";
        if (section.positionAndSizeLocked) {
          sectionCursor = "default";
        } else if (draggingSectionId === section.sectionId) {
          sectionCursor = "grabbing";
        }

        return (
          <div
            key={section.sectionId}
            className="react-flow__node"
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
            data-dragging={
              draggingSectionId === section.sectionId ? "true" : "false"
            }
            data-testid="graph-substrate-canary-section"
            onPointerDownCapture={(event) =>
              handleSectionPointerDown(section, event)
            }
            onPointerMoveCapture={handleSectionPointerMove}
            onPointerUpCapture={(event) => finishSectionDrag(event, true)}
            onPointerCancelCapture={(event) => finishSectionDrag(event, false)}
          >
            <SectionContainer sectionId={section.sectionId} isTopLevel={true} />
          </div>
        );
      })}
    </>
  );
}

export const SettingsGraphSubstrateCanarySectionsLayer = React.memo(
  _SettingsGraphSubstrateCanarySectionsLayer,
);
