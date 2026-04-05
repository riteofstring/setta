import React, {
  useCallback,
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
  type SettingsGraphSubstrateCanarySectionBody,
} from "./settingsGraphSubstrateCanarySectionBodyAdapter";
import type { SettingsGraphSubstrateCanarySectionDragController } from "./settingsGraphSubstrateCanarySectionDragController";
import { SettingsGraphSubstrateCanarySectionShell } from "./settingsGraphSubstrateCanarySectionShell";
import {
  worldPointToScreenPoint,
  type GraphRect,
  type GraphViewport,
} from "./viewportTransform";

const MIN_SECTION_BODY_VISIBLE_SCREEN_WIDTH = 120;
const MIN_SECTION_BODY_VISIBLE_SCREEN_HEIGHT = 24;

type SettingsGraphSubstrateCanarySectionsLayerProps = {
  draggingSectionId: string | null;
  onHoveredSectionChange: (sectionId: string | null) => void;
  sceneSections: Array<SettingsGraphSubstrateCanarySceneSection>;
  sectionDragController: SettingsGraphSubstrateCanarySectionDragController;
  viewport: GraphViewport | null;
  visibleViewportRect: GraphRect | null;
};

type SettingsGraphSubstrateCanarySectionEntryProps = {
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
  sectionBody: SettingsGraphSubstrateCanarySectionBody;
  shouldMountBody: boolean;
};

function _SettingsGraphSubstrateCanarySectionEntry({
  draggingSectionId,
  finishSectionDrag,
  handleSectionPointerDown,
  handleSectionPointerMove,
  onHoveredSectionChange,
  section,
  sectionBody,
  shouldMountBody,
}: SettingsGraphSubstrateCanarySectionEntryProps) {
  return (
    <SettingsGraphSubstrateCanarySectionShell
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
}

const SettingsGraphSubstrateCanarySectionEntry = React.memo(
  _SettingsGraphSubstrateCanarySectionEntry,
);

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

  const sectionBodiesById = useMemo(() => {
    return new Map(
      sceneSections.map((section) => [
        section.sectionId,
        resolveSettingsGraphSubstrateCanarySectionBody({
          positionAndSizeLocked: section.positionAndSizeLocked,
          sectionId: section.sectionId,
          sectionTypeName: section.sectionTypeName ?? SectionTypeEnum.Code,
          shellChromeOwner: "shell-layer",
          styleColor: section.styleColor ?? null,
          textBlockMetaControlStyle: section.textBlockMetaControlStyle ?? false,
        }),
      ]),
    );
  }, [sceneSections]);

  const handleSectionPointerDown = useCallback(
    (
      section: SettingsGraphSubstrateCanarySceneSection,
      event: ReactPointerEvent<HTMLDivElement>,
    ) => {
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
    },
    [sectionDragController],
  );

  const handleSectionPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
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
    },
    [sectionDragController],
  );

  const finishSectionDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, persistLayout: boolean) => {
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
    },
    [sectionDragController],
  );

  return (
    <>
      {sceneSections.map((section) => {
        const shouldMountBody = mountedSectionBodyIds.has(section.sectionId);
        const sectionBody = sectionBodiesById.get(section.sectionId);
        if (!sectionBody) {
          throw new Error(
            `Missing graph substrate section body for ${section.sectionId}.`,
          );
        }
        return (
          <SettingsGraphSubstrateCanarySectionEntry
            key={section.sectionId}
            draggingSectionId={draggingSectionId}
            finishSectionDrag={finishSectionDrag}
            handleSectionPointerDown={handleSectionPointerDown}
            handleSectionPointerMove={handleSectionPointerMove}
            onHoveredSectionChange={onHoveredSectionChange}
            section={section}
            sectionBody={sectionBody}
            shouldMountBody={shouldMountBody}
          />
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
  const sectionScreenRect = {
    x: sectionScreenPosition.x,
    y: sectionScreenPosition.y,
    width: sectionBoundsSize.width * viewport.zoom,
    height: sectionBoundsSize.height * viewport.zoom,
  };
  const visibleSectionScreenRect = getGraphRectIntersection(
    sectionScreenRect,
    visibleViewportRect,
  );
  if (visibleSectionScreenRect === null) {
    return false;
  }

  return (
    visibleSectionScreenRect.width >= MIN_SECTION_BODY_VISIBLE_SCREEN_WIDTH &&
    visibleSectionScreenRect.height >= MIN_SECTION_BODY_VISIBLE_SCREEN_HEIGHT
  );
}

function getGraphRectIntersection(
  left: GraphRect,
  right: GraphRect,
): GraphRect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  const width = rightEdge - x;
  const height = bottomEdge - y;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}

export const SettingsGraphSubstrateCanarySectionsLayer = React.memo(
  _SettingsGraphSubstrateCanarySectionsLayer,
);
