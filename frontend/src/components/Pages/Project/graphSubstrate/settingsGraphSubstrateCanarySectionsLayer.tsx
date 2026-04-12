import React, {
  Profiler,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import {
  measureSettingsGraphSubstrateCanaryMotionAttribution,
  recordSettingsGraphSubstrateCanaryMotionAttributionDuration,
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

type StableSectionEntryElement = {
  element: React.ReactElement;
  isDragging: boolean;
  section: SettingsGraphSubstrateCanarySceneSection;
  sectionBody: SettingsGraphSubstrateCanarySectionBody;
  shouldMountBody: boolean;
};

function doSettingsGraphSubstrateCanarySectionBodyInputsMatchSceneSection(
  sectionBody: SettingsGraphSubstrateCanarySectionBody,
  sceneSection: SettingsGraphSubstrateCanarySceneSection,
) {
  return (
    sectionBody.hasEmbeddedTerminal ===
      (sceneSection.hasEmbeddedTerminal ?? false) &&
    sectionBody.isMinimized === (sceneSection.isMinimized ?? false) &&
    sectionBody.isInOtherProjectConfigs ===
      (sceneSection.isInOtherProjectConfigs ?? false) &&
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

function handleSettingsGraphSubstrateCanarySectionBodyRender(
  _id: string,
  _phase: "mount" | "nested-update" | "update",
  actualDuration: number,
) {
  recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
    "presentedSceneSectionBodySubtreeReactRender",
    actualDuration,
  );
}

type SettingsGraphSubstrateCanarySectionEntryBodyProps = {
  sectionBody: SettingsGraphSubstrateCanarySectionBody;
  sectionId: string;
  shouldMountBody: boolean;
};

function _SettingsGraphSubstrateCanarySectionEntryBody({
  sectionBody,
  sectionId,
  shouldMountBody,
}: SettingsGraphSubstrateCanarySectionEntryBodyProps) {
  if (!shouldMountBody) {
    return null;
  }

  return (
    <Profiler
      id={`settings-graph-substrate-canary-section-body:${sectionId}`}
      onRender={handleSettingsGraphSubstrateCanarySectionBodyRender}
    >
      <SettingsGraphSubstrateCanarySectionBodyDomAdapter
        sectionBody={sectionBody}
      />
    </Profiler>
  );
}

const SettingsGraphSubstrateCanarySectionEntryBody = React.memo(
  _SettingsGraphSubstrateCanarySectionEntryBody,
  (previousProps, nextProps) =>
    previousProps.sectionBody === nextProps.sectionBody &&
    previousProps.sectionId === nextProps.sectionId &&
    previousProps.shouldMountBody === nextProps.shouldMountBody,
);

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
      <SettingsGraphSubstrateCanarySectionEntryBody
        sectionBody={sectionBody}
        sectionId={section.sectionId}
        shouldMountBody={shouldMountBody}
      />
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
  const stableSectionEntryElementsByIdRef = useRef<
    Map<string, StableSectionEntryElement>
  >(new Map());
  const stableSectionEntriesRef = useRef<Array<React.ReactElement>>([]);
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
        hasEmbeddedTerminal: section.hasEmbeddedTerminal ?? false,
        isMinimized: section.isMinimized ?? false,
        isInOtherProjectConfigs: section.isInOtherProjectConfigs ?? false,
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
    const previousSectionEntryElementsById =
      stableSectionEntryElementsByIdRef.current;
    const nextSectionEntryElementsById = new Map<
      string,
      StableSectionEntryElement
    >();
    const nextSectionEntries: Array<React.ReactElement> = [];
    let canReuseSectionEntriesArray =
      stableSectionEntriesRef.current.length ===
      resolvedPresentedSceneSections.length;

    return measureSettingsGraphSubstrateCanaryMotionAttribution(
      "presentedSceneSectionEntriesResolve",
      () => {
        resolvedPresentedSceneSections.forEach((section, index) => {
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
          const isDragging = draggingSectionId === section.sectionId;
          const previousSectionEntryElement =
            previousSectionEntryElementsById.get(section.sectionId);
          const canReuseSectionEntryElement =
            previousSectionEntryElement !== undefined &&
            previousSectionEntryElement.isDragging === isDragging &&
            previousSectionEntryElement.section === section &&
            previousSectionEntryElement.sectionBody === sectionBody &&
            previousSectionEntryElement.shouldMountBody === shouldMountBody;
          const nextSectionEntryElement = canReuseSectionEntryElement
            ? previousSectionEntryElement
            : {
                element: (
                  <SettingsGraphSubstrateCanarySectionEntry
                    key={section.sectionId}
                    finishSectionDrag={finishSectionDrag}
                    handleSectionPointerDown={handleSectionPointerDown}
                    handleSectionPointerMove={handleSectionPointerMove}
                    isDragging={isDragging}
                    onHoveredSectionChange={onHoveredSectionChange}
                    section={section}
                    sectionBody={sectionBody}
                    shouldMountBody={shouldMountBody}
                  />
                ),
                isDragging,
                section,
                sectionBody,
                shouldMountBody,
              };
          nextSectionEntryElementsById.set(
            section.sectionId,
            nextSectionEntryElement,
          );
          nextSectionEntries.push(nextSectionEntryElement.element);
          if (
            canReuseSectionEntriesArray &&
            stableSectionEntriesRef.current[index] !==
              nextSectionEntryElement.element
          ) {
            canReuseSectionEntriesArray = false;
          }
        });

        stableSectionEntryElementsByIdRef.current =
          nextSectionEntryElementsById;
        if (canReuseSectionEntriesArray) {
          return stableSectionEntriesRef.current;
        }
        stableSectionEntriesRef.current = nextSectionEntries;
        return nextSectionEntries;
      },
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
    left.hasEmbeddedTerminal === right.hasEmbeddedTerminal &&
    left.isMinimized === right.isMinimized &&
    left.isInOtherProjectConfigs === right.isInOtherProjectConfigs &&
    left.positionAndSizeLocked === right.positionAndSizeLocked &&
    left.sectionId === right.sectionId &&
    left.sectionTypeName === right.sectionTypeName &&
    left.shellChromeOwner === right.shellChromeOwner &&
    left.styleColor === right.styleColor &&
    left.textBlockMetaControlStyle === right.textBlockMetaControlStyle
  );
}
