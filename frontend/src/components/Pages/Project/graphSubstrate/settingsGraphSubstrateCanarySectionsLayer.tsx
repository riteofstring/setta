import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import {
  measureSettingsGraphSubstrateCanaryMotionAttribution,
  updateSettingsGraphSubstrateCanaryInstrumentationSnapshot,
} from "./settingsGraphSubstrateCanaryInstrumentation";
import type { SettingsGraphSubstrateCanarySceneSection } from "./settingsGraphSubstrateCanarySceneSnapshot";
import {
  resolveSettingsGraphSubstrateCanarySectionBody,
  SettingsGraphSubstrateCanarySectionBodyDomAdapter,
  type SettingsGraphSubstrateCanarySectionBody,
} from "./settingsGraphSubstrateCanarySectionBodyAdapter";
import type { SettingsGraphSubstrateCanarySectionDragController } from "./settingsGraphSubstrateCanarySectionDragController";
import {
  areSettingsGraphSubstrateCanaryPresentedSceneSectionsEqual,
  areSettingsGraphSubstrateCanarySectionIdSetsEqual,
  resolveSettingsGraphSubstrateCanaryMountedSectionBodyIds,
  resolveSettingsGraphSubstrateCanaryPresentedSceneSections,
} from "./settingsGraphSubstrateCanarySectionPresentation";
import { SettingsGraphSubstrateCanarySectionShell } from "./settingsGraphSubstrateCanarySectionShell";
import type { GraphRect, GraphViewport } from "./viewportTransform";

type SettingsGraphSubstrateCanarySectionsLayerProps = {
  draggingSectionId: string | null;
  hoveredSectionId: string | null;
  mountedSectionBodyIds?: ReadonlySet<string>;
  onHoveredSectionChange: (sectionId: string | null) => void;
  presentedSceneSections?: Array<SettingsGraphSubstrateCanarySceneSection>;
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
  mountedSectionBodyIds,
  onHoveredSectionChange,
  presentedSceneSections,
  sceneSections,
  sectionDragController,
  viewport,
  visibleViewportRect,
}: SettingsGraphSubstrateCanarySectionsLayerProps) {
  const stablePresentedSceneSectionsRef = useRef<
    Array<SettingsGraphSubstrateCanarySceneSection>
  >([]);
  const stableMountedSectionBodyIdsRef = useRef<ReadonlySet<string>>(new Set());
  const resolvedPresentedSceneSections = useMemo(() => {
    if (presentedSceneSections) {
      return presentedSceneSections;
    }

    const nextPresentedSceneSections =
      resolveSettingsGraphSubstrateCanaryPresentedSceneSections({
        draggingSectionId,
        sceneSections,
        viewport,
        visibleViewportRect,
      });
    const shouldReusePresentedSceneSections =
      measureSettingsGraphSubstrateCanaryMotionAttribution(
        "presentedSceneSectionArrayReuseCheck",
        () =>
          areSettingsGraphSubstrateCanaryPresentedSceneSectionsEqual(
            stablePresentedSceneSectionsRef.current,
            nextPresentedSceneSections,
          ),
      );
    if (shouldReusePresentedSceneSections) {
      return stablePresentedSceneSectionsRef.current;
    }
    stablePresentedSceneSectionsRef.current = nextPresentedSceneSections;
    return nextPresentedSceneSections;
  }, [
    draggingSectionId,
    presentedSceneSections,
    sceneSections,
    viewport,
    visibleViewportRect,
  ]);
  const presentedSectionIds = useMemo(() => {
    return new Set(
      resolvedPresentedSceneSections.map((section) => section.sectionId),
    );
  }, [resolvedPresentedSceneSections]);

  useEffect(() => {
    if (
      hoveredSectionId !== null &&
      !presentedSectionIds.has(hoveredSectionId)
    ) {
      onHoveredSectionChange(null);
    }
  }, [hoveredSectionId, onHoveredSectionChange, presentedSectionIds]);

  const resolvedMountedSectionBodyIds = useMemo(() => {
    if (mountedSectionBodyIds) {
      stableMountedSectionBodyIdsRef.current = mountedSectionBodyIds;
      return mountedSectionBodyIds;
    }
    const nextMountedSectionBodyIds =
      measureSettingsGraphSubstrateCanaryMotionAttribution(
        "presentedSceneBodyMountFilter",
        () =>
          resolveSettingsGraphSubstrateCanaryMountedSectionBodyIds({
            draggingSectionId,
            presentedSceneSections: resolvedPresentedSceneSections,
            viewport,
            visibleViewportRect,
          }),
      );
    const shouldReuseMountedSectionBodyIds =
      measureSettingsGraphSubstrateCanaryMotionAttribution(
        "mountedSectionBodyIdSetReuseCheck",
        () =>
          areSettingsGraphSubstrateCanarySectionIdSetsEqual(
            stableMountedSectionBodyIdsRef.current,
            nextMountedSectionBodyIds,
          ),
      );
    if (shouldReuseMountedSectionBodyIds) {
      return stableMountedSectionBodyIdsRef.current;
    }
    stableMountedSectionBodyIdsRef.current = nextMountedSectionBodyIds;
    return nextMountedSectionBodyIds;
  }, [
    draggingSectionId,
    mountedSectionBodyIds,
    resolvedPresentedSceneSections,
    viewport,
    visibleViewportRect,
  ]);

  useEffect(() => {
    updateSettingsGraphSubstrateCanaryInstrumentationSnapshot({
      mountedSectionBodyCount: resolvedMountedSectionBodyIds.size,
    });
  }, [resolvedMountedSectionBodyIds]);

  const sectionBodiesById = useMemo(() => {
    return new Map(
      resolvedPresentedSceneSections.map((section) => [
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
  }, [resolvedPresentedSceneSections]);

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
  const sectionEntries = useMemo(() => {
    return measureSettingsGraphSubstrateCanaryMotionAttribution(
      "presentedSceneSectionEntriesResolve",
      () =>
        resolvedPresentedSceneSections.map((section) => {
          const shouldMountBody = resolvedMountedSectionBodyIds.has(
            section.sectionId,
          );
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
        }),
    );
  }, [
    draggingSectionId,
    finishSectionDrag,
    handleSectionPointerDown,
    handleSectionPointerMove,
    onHoveredSectionChange,
    resolvedMountedSectionBodyIds,
    resolvedPresentedSceneSections,
    sectionBodiesById,
  ]);

  return <>{sectionEntries}</>;
}

export const SettingsGraphSubstrateCanarySectionsLayer = React.memo(
  _SettingsGraphSubstrateCanarySectionsLayer,
);
