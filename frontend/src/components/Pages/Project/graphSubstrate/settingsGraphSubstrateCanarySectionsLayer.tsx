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
  mountedSectionBodyIds?: ReadonlySet<string>;
  onHoveredSectionChange: (sectionId: string | null) => void;
  presentedSceneSections?: Array<SettingsGraphSubstrateCanarySceneSection>;
  sceneSections?: Array<SettingsGraphSubstrateCanarySceneSection>;
  sectionDragController: SettingsGraphSubstrateCanarySectionDragController;
  viewport?: GraphViewport | null;
  visibleViewportRect?: GraphRect | null;
};

type StableSectionBodyEntry = {
  sceneSection: SettingsGraphSubstrateCanarySceneSection;
  sectionBody: SettingsGraphSubstrateCanarySectionBody;
};

function doSettingsGraphSubstrateCanarySectionBodyInputsMatchSceneSection(
  sectionBody: SettingsGraphSubstrateCanarySectionBody,
  sceneSection: SettingsGraphSubstrateCanarySceneSection,
) {
  return (
    sectionBody.positionAndSizeLocked === sceneSection.positionAndSizeLocked &&
    sectionBody.sectionId === sceneSection.sectionId &&
    sectionBody.sectionTypeName ===
      (sceneSection.sectionTypeName ?? SectionTypeEnum.Code) &&
    sectionBody.shellChromeOwner === "shell-layer" &&
    sectionBody.styleColor === (sceneSection.styleColor ?? null) &&
    sectionBody.textBlockMetaControlStyle ===
      (sceneSection.textBlockMetaControlStyle ?? false)
  );
}

type SettingsGraphSubstrateCanarySectionEntryProps = {
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
  sectionBody: SettingsGraphSubstrateCanarySectionBody;
  shouldMountBody: boolean;
};

function _SettingsGraphSubstrateCanarySectionEntry({
  finishSectionDrag,
  handleSectionPointerDown,
  handleSectionPointerMove,
  isDragging,
  onHoveredSectionChange,
  section,
  sectionBody,
  shouldMountBody,
}: SettingsGraphSubstrateCanarySectionEntryProps) {
  return (
    <SettingsGraphSubstrateCanarySectionShell
      finishSectionDrag={finishSectionDrag}
      handleSectionPointerDown={handleSectionPointerDown}
      handleSectionPointerMove={handleSectionPointerMove}
      isDragging={isDragging}
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
  const stableSectionBodiesByIdRef = useRef<
    Map<string, StableSectionBodyEntry>
  >(new Map());
  const resolvedPresentedSceneSections = useMemo(() => {
    if (presentedSceneSections) {
      return presentedSceneSections;
    }
    if (!sceneSections) {
      throw new Error(
        "sceneSections are required when presentedSceneSections are not provided.",
      );
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
  const resolvedMountedSectionBodyIds = useMemo(() => {
    if (mountedSectionBodyIds) {
      stableMountedSectionBodyIdsRef.current = mountedSectionBodyIds;
      return mountedSectionBodyIds;
    }
    if (viewport === undefined || visibleViewportRect === undefined) {
      throw new Error(
        "viewport and visibleViewportRect are required when mountedSectionBodyIds are not provided.",
      );
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
    const previousSectionBodiesById = stableSectionBodiesByIdRef.current;
    const nextSectionBodiesById = new Map<string, StableSectionBodyEntry>();

    for (const section of resolvedPresentedSceneSections) {
      const previousSectionBodyEntry = previousSectionBodiesById.get(
        section.sectionId,
      );
      if (
        previousSectionBodyEntry &&
        (previousSectionBodyEntry.sceneSection === section ||
          doSettingsGraphSubstrateCanarySectionBodyInputsMatchSceneSection(
            previousSectionBodyEntry.sectionBody,
            section,
          ))
      ) {
        nextSectionBodiesById.set(section.sectionId, previousSectionBodyEntry);
        continue;
      }
      const nextSectionBody = resolveSettingsGraphSubstrateCanarySectionBody({
        positionAndSizeLocked: section.positionAndSizeLocked,
        sectionId: section.sectionId,
        sectionTypeName: section.sectionTypeName ?? SectionTypeEnum.Code,
        shellChromeOwner: "shell-layer",
        styleColor: section.styleColor ?? null,
        textBlockMetaControlStyle: section.textBlockMetaControlStyle ?? false,
      });
      const previousSectionBody = previousSectionBodyEntry?.sectionBody;
      nextSectionBodiesById.set(
        section.sectionId,
        previousSectionBody &&
          areSettingsGraphSubstrateCanarySectionBodiesEqual(
            previousSectionBody,
            nextSectionBody,
          )
          ? previousSectionBodyEntry
          : {
              sceneSection: section,
              sectionBody: nextSectionBody,
            },
      );
    }

    stableSectionBodiesByIdRef.current = nextSectionBodiesById;
    return nextSectionBodiesById;
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
          const stableSectionBodyEntry = sectionBodiesById.get(
            section.sectionId,
          );
          if (!stableSectionBodyEntry) {
            throw new Error(
              `Missing graph substrate section body for ${section.sectionId}.`,
            );
          }
          const sectionBody = stableSectionBodyEntry.sectionBody;
          return (
            <SettingsGraphSubstrateCanarySectionEntry
              key={section.sectionId}
              finishSectionDrag={finishSectionDrag}
              handleSectionPointerDown={handleSectionPointerDown}
              handleSectionPointerMove={handleSectionPointerMove}
              isDragging={draggingSectionId === section.sectionId}
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

function areSettingsGraphSubstrateCanarySectionBodiesEqual(
  left: SettingsGraphSubstrateCanarySectionBody,
  right: SettingsGraphSubstrateCanarySectionBody,
) {
  return (
    left.positionAndSizeLocked === right.positionAndSizeLocked &&
    left.sectionId === right.sectionId &&
    left.sectionTypeName === right.sectionTypeName &&
    left.shellChromeOwner === right.shellChromeOwner &&
    left.styleColor === right.styleColor &&
    left.textBlockMetaControlStyle === right.textBlockMetaControlStyle
  );
}
