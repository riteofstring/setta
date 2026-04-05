import React, {
  useEffect,
  useMemo,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import { updateSettingsGraphSubstrateCanaryInstrumentationSnapshot } from "./settingsGraphSubstrateCanaryInstrumentation";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  resolveSettingsGraphSubstrateCanarySectionBody,
  SettingsGraphSubstrateCanarySectionBodyDomAdapter,
} from "./settingsGraphSubstrateCanarySectionBodyAdapter";
import type { SettingsGraphSubstrateCanarySectionDragController } from "./settingsGraphSubstrateCanarySectionDragController";
import { SettingsGraphSubstrateCanarySectionShell } from "./settingsGraphSubstrateCanarySectionShell";
import {
  worldPointToScreenPoint,
  type GraphRect,
  type GraphViewport,
} from "./viewportTransform";

type SettingsGraphSubstrateCanarySectionsLayerProps = {
  draggingSectionId: string | null;
  onHoveredSectionChange: (sectionId: string | null) => void;
  sceneSections: Array<SettingsGraphSubstrateCanarySceneSection>;
  sectionDragController: SettingsGraphSubstrateCanarySectionDragController;
  viewport: GraphViewport | null;
  visibleViewportRect: GraphRect | null;
};

function _SettingsGraphSubstrateCanarySectionsLayer({
  draggingSectionId,
  onHoveredSectionChange,
  sceneSections,
  sectionDragController,
  viewport,
  visibleViewportRect,
}: SettingsGraphSubstrateCanarySectionsLayerProps) {
  const mountedSectionBodyIds = useMemo(() => {
    return new Set(
      sceneSections
        .filter((section) =>
          shouldMountSettingsGraphSubstrateCanarySectionBody({
            draggingSectionId,
            section,
            viewport,
            visibleViewportRect,
          }),
        )
        .map((section) => section.sectionId),
    );
  }, [draggingSectionId, sceneSections, viewport, visibleViewportRect]);

  useEffect(() => {
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      mountedSectionBodyCount: mountedSectionBodyIds.size,
    });
  }, [mountedSectionBodyIds]);

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
        const shouldMountBody = mountedSectionBodyIds.has(section.sectionId);
        const sectionBody = resolveSettingsGraphSubstrateCanarySectionBody({
          positionAndSizeLocked: section.positionAndSizeLocked,
          sectionId: section.sectionId,
          sectionTypeName: section.sectionTypeName ?? SectionTypeEnum.Code,
          shellChromeOwner: "shell-layer",
          styleColor: section.styleColor ?? null,
          textBlockMetaControlStyle: section.textBlockMetaControlStyle ?? false,
        });
        return (
          <SettingsGraphSubstrateCanarySectionShell
            key={section.sectionId}
            draggingSectionId={draggingSectionId}
            finishSectionDrag={finishSectionDrag}
            handleSectionPointerDown={handleSectionPointerDown}
            handleSectionPointerMove={handleSectionPointerMove}
            onHoveredSectionChange={onHoveredSectionChange}
            section={section}
          >
            {shouldMountBody ? (
              <SettingsGraphSubstrateCanarySectionBodyDomAdapter
                sectionBody={sectionBody}
              />
            ) : null}
          </SettingsGraphSubstrateCanarySectionShell>
        );
      })}
    </>
  );
}

export function shouldMountSettingsGraphSubstrateCanarySectionBody({
  draggingSectionId,
  section,
  viewport,
  visibleViewportRect,
}: {
  draggingSectionId: string | null;
  section: SettingsGraphSubstrateCanarySceneSection;
  viewport: GraphViewport | null;
  visibleViewportRect: GraphRect | null;
}): boolean {
  if (
    section.sectionId === draggingSectionId ||
    section.isActiveSection === true ||
    viewport === null ||
    viewport.zoom <= 0 ||
    visibleViewportRect === null
  ) {
    return true;
  }

  const sectionBoundsSize = section.sceneBoundsSize;
  if (!sectionBoundsSize) {
    return true;
  }

  const sectionScreenPosition = worldPointToScreenPoint(
    section.renderedPosition,
    viewport,
  );
  return graphRectsIntersect(
    {
      x: sectionScreenPosition.x,
      y: sectionScreenPosition.y,
      width: sectionBoundsSize.width * viewport.zoom,
      height: sectionBoundsSize.height * viewport.zoom,
    },
    visibleViewportRect,
  );
}

function graphRectsIntersect(left: GraphRect, right: GraphRect) {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

export const SettingsGraphSubstrateCanarySectionsLayer = React.memo(
  _SettingsGraphSubstrateCanarySectionsLayer,
);
