import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
  hoveredSectionId: string | null;
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
  hoveredSectionId,
  onHoveredSectionChange,
  sceneSections,
  sectionDragController,
  viewport,
  visibleViewportRect,
}: SettingsGraphSubstrateCanarySectionsLayerProps) {
  const stablePresentedSceneSectionsRef = useRef<
    Array<SettingsGraphSubstrateCanarySceneSection>
  >([]);
  const presentedSceneSections = useMemo(() => {
    const nextPresentedSceneSections = sceneSections.filter((section) =>
      shouldPresentSettingsGraphSubstrateCanarySectionShell({
        draggingSectionId,
        section,
        viewport,
        visibleViewportRect,
      }),
    );
    if (
      areSettingsGraphSubstrateCanaryPresentedSceneSectionsEqual(
        stablePresentedSceneSectionsRef.current,
        nextPresentedSceneSections,
      )
    ) {
      return stablePresentedSceneSectionsRef.current;
    }
    stablePresentedSceneSectionsRef.current = nextPresentedSceneSections;
    return nextPresentedSceneSections;
  }, [draggingSectionId, sceneSections, viewport, visibleViewportRect]);
  const presentedSectionIds = useMemo(() => {
    return new Set(presentedSceneSections.map((section) => section.sectionId));
  }, [presentedSceneSections]);

  useEffect(() => {
    if (
      hoveredSectionId !== null &&
      !presentedSectionIds.has(hoveredSectionId)
    ) {
      onHoveredSectionChange(null);
    }
  }, [hoveredSectionId, onHoveredSectionChange, presentedSectionIds]);

  const mountedSectionBodyIds = useMemo(() => {
    return new Set(
      presentedSceneSections
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
  }, [
    draggingSectionId,
    presentedSceneSections,
    viewport,
    visibleViewportRect,
  ]);

  useEffect(() => {
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      mountedSectionBodyCount: mountedSectionBodyIds.size,
    });
  }, [mountedSectionBodyIds]);

  const sectionBodiesById = useMemo(() => {
    return new Map(
      presentedSceneSections.map((section) => [
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
  }, [presentedSceneSections]);

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
      {presentedSceneSections.map((section) => {
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

export function shouldPresentSettingsGraphSubstrateCanarySectionShell({
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

  return (
    getVisibleSettingsGraphSubstrateCanarySectionScreenRect({
      section,
      viewport,
      visibleViewportRect,
    }) !== null
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

  const visibleSectionScreenRect =
    getVisibleSettingsGraphSubstrateCanarySectionScreenRect({
      section,
      viewport,
      visibleViewportRect,
    });
  if (visibleSectionScreenRect === null) {
    return false;
  }

  return (
    visibleSectionScreenRect.width >= MIN_SECTION_BODY_VISIBLE_SCREEN_WIDTH &&
    visibleSectionScreenRect.height >= MIN_SECTION_BODY_VISIBLE_SCREEN_HEIGHT
  );
}

function getVisibleSettingsGraphSubstrateCanarySectionScreenRect({
  section,
  viewport,
  visibleViewportRect,
}: {
  section: SettingsGraphSubstrateCanarySceneSection;
  viewport: GraphViewport;
  visibleViewportRect: GraphRect;
}): GraphRect | null {
  const sectionBoundsSize = section.sceneBoundsSize;
  if (!sectionBoundsSize) {
    return visibleViewportRect;
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
  return getGraphRectIntersection(sectionScreenRect, visibleViewportRect);
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

function areSettingsGraphSubstrateCanaryPresentedSceneSectionsEqual(
  left: ReadonlyArray<SettingsGraphSubstrateCanarySceneSection>,
  right: ReadonlyArray<SettingsGraphSubstrateCanarySceneSection>,
) {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export const SettingsGraphSubstrateCanarySectionsLayer = React.memo(
  _SettingsGraphSubstrateCanarySectionsLayer,
);
