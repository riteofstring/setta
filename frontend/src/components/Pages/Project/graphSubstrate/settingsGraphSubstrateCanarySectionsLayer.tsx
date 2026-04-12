import React, {
  Profiler,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
import {
  SettingsGraphSubstrateCanarySectionShell,
  type SettingsGraphSubstrateCanarySectionShellHandle,
  type SettingsGraphSubstrateCanarySectionShellState,
} from "./settingsGraphSubstrateCanarySectionShell";
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
  sectionBodyState: SettingsGraphSubstrateCanarySectionEntryBodyState;
  sectionId: string;
  shellState: SettingsGraphSubstrateCanarySectionShellState;
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
  initialBodyState: SettingsGraphSubstrateCanarySectionEntryBodyState;
  initialShellState: SettingsGraphSubstrateCanarySectionShellState;
  onHoveredSectionChange: (sectionId: string | null) => void;
};
type SettingsGraphSubstrateCanarySectionEntryBodyState = {
  sectionBody: SettingsGraphSubstrateCanarySectionBody;
  sectionId: string;
  shouldMountBody: boolean;
};

type SettingsGraphSubstrateCanarySectionEntryBodyHandle = {
  update: (
    nextState: SettingsGraphSubstrateCanarySectionEntryBodyState,
  ) => void;
};

type SettingsGraphSubstrateCanarySectionEntryHandle = {
  updateBody: (
    nextState: SettingsGraphSubstrateCanarySectionEntryBodyState,
  ) => void;
  updateShell: (
    nextState: SettingsGraphSubstrateCanarySectionShellState,
  ) => void;
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

function handleSettingsGraphSubstrateCanarySectionEntryBodyGateRender(
  _id: string,
  _phase: "mount" | "nested-update" | "update",
  actualDuration: number,
) {
  recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
    "presentedSceneSectionEntryBodyGateReactRender",
    actualDuration,
  );
}

function handleSettingsGraphSubstrateCanarySectionEntryShellRender(
  _id: string,
  _phase: "mount" | "nested-update" | "update",
  actualDuration: number,
) {
  recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
    "presentedSceneSectionEntryShellReactRender",
    actualDuration,
  );
}

function areSettingsGraphSubstrateCanarySectionEntryBodyStatesEqual(
  left: SettingsGraphSubstrateCanarySectionEntryBodyState,
  right: SettingsGraphSubstrateCanarySectionEntryBodyState,
) {
  return (
    left.sectionBody === right.sectionBody &&
    left.sectionId === right.sectionId &&
    left.shouldMountBody === right.shouldMountBody
  );
}

function areSettingsGraphSubstrateCanarySectionShellStatesEqual(
  left: SettingsGraphSubstrateCanarySectionShellState,
  right: SettingsGraphSubstrateCanarySectionShellState,
) {
  return left.isDragging === right.isDragging && left.section === right.section;
}

type SettingsGraphSubstrateCanarySectionEntryBodyProps = {
  initialState: SettingsGraphSubstrateCanarySectionEntryBodyState;
};

function _SettingsGraphSubstrateCanarySectionEntryBody(
  { initialState }: SettingsGraphSubstrateCanarySectionEntryBodyProps,
  forwardedRef: React.ForwardedRef<SettingsGraphSubstrateCanarySectionEntryBodyHandle>,
) {
  const sectionBodyStateRef =
    useRef<SettingsGraphSubstrateCanarySectionEntryBodyState>(initialState);
  const [, forceRender] = useState(0);

  useImperativeHandle(
    forwardedRef,
    () => ({
      update(nextState) {
        const previousState = sectionBodyStateRef.current;
        if (
          previousState.sectionBody === nextState.sectionBody &&
          previousState.sectionId === nextState.sectionId &&
          previousState.shouldMountBody === nextState.shouldMountBody
        ) {
          return;
        }
        sectionBodyStateRef.current = nextState;
        forceRender((previousVersion) => previousVersion + 1);
      },
    }),
    [],
  );

  const { sectionBody, sectionId, shouldMountBody } =
    sectionBodyStateRef.current;

  return (
    <Profiler
      id={`settings-graph-substrate-canary-section-entry-body-gate:${sectionId}`}
      onRender={handleSettingsGraphSubstrateCanarySectionEntryBodyGateRender}
    >
      {shouldMountBody ? (
        <Profiler
          id={`settings-graph-substrate-canary-section-body:${sectionId}`}
          onRender={handleSettingsGraphSubstrateCanarySectionBodyRender}
        >
          <SettingsGraphSubstrateCanarySectionBodyDomAdapter
            sectionBody={sectionBody}
          />
        </Profiler>
      ) : null}
    </Profiler>
  );
}

const SettingsGraphSubstrateCanarySectionEntryBody = React.memo(
  React.forwardRef(_SettingsGraphSubstrateCanarySectionEntryBody),
);

function _SettingsGraphSubstrateCanarySectionEntry(
  {
    finishSectionDrag,
    handleSectionPointerDown,
    handleSectionPointerMove,
    initialBodyState,
    initialShellState,
    onHoveredSectionChange,
  }: SettingsGraphSubstrateCanarySectionEntryProps,
  forwardedRef: React.ForwardedRef<SettingsGraphSubstrateCanarySectionEntryHandle>,
) {
  const shellHandleRef =
    useRef<SettingsGraphSubstrateCanarySectionShellHandle | null>(null);
  const bodyHandleRef =
    useRef<SettingsGraphSubstrateCanarySectionEntryBodyHandle | null>(null);

  useImperativeHandle(
    forwardedRef,
    () => ({
      updateBody(nextState) {
        bodyHandleRef.current?.update(nextState);
      },
      updateShell(nextState) {
        shellHandleRef.current?.update(nextState);
      },
    }),
    [],
  );

  return (
    <Profiler
      id={`settings-graph-substrate-canary-section-entry-shell:${initialShellState.section.sectionId}`}
      onRender={handleSettingsGraphSubstrateCanarySectionEntryShellRender}
    >
      <SettingsGraphSubstrateCanarySectionShell
        ref={shellHandleRef}
        initialState={initialShellState}
        finishSectionDrag={finishSectionDrag}
        handleSectionPointerDown={handleSectionPointerDown}
        handleSectionPointerMove={handleSectionPointerMove}
        onHoveredSectionChange={onHoveredSectionChange}
      >
        <SettingsGraphSubstrateCanarySectionEntryBody
          ref={bodyHandleRef}
          initialState={initialBodyState}
        />
      </SettingsGraphSubstrateCanarySectionShell>
    </Profiler>
  );
}

const SettingsGraphSubstrateCanarySectionEntry = React.memo(
  React.forwardRef(_SettingsGraphSubstrateCanarySectionEntry),
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
  const stableSectionShellHandlesByIdRef = useRef<
    Map<string, SettingsGraphSubstrateCanarySectionEntryHandle>
  >(new Map());
  const stableSectionEntriesRef = useRef<Array<React.ReactElement>>([]);
  const flushedSectionBodyStatesByIdRef = useRef<
    Map<string, SettingsGraphSubstrateCanarySectionEntryBodyState>
  >(new Map());
  const flushedSectionShellStatesByIdRef = useRef<
    Map<string, SettingsGraphSubstrateCanarySectionShellState>
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
            previousMountedSectionBodyIds:
              stableMountedSectionBodyIdsRef.current,
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

  const registerSectionShellHandle = useCallback(
    (
      sectionId: string,
      shellHandle: SettingsGraphSubstrateCanarySectionEntryHandle | null,
    ) => {
      if (shellHandle) {
        stableSectionShellHandlesByIdRef.current.set(sectionId, shellHandle);
        return;
      }
      stableSectionShellHandlesByIdRef.current.delete(sectionId);
    },
    [],
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
          const previousShellState = previousSectionEntryElement?.shellState;
          const unresolvedShellState: SettingsGraphSubstrateCanarySectionShellState =
            {
              isDragging,
              section,
            };
          const nextShellState =
            previousShellState &&
            areSettingsGraphSubstrateCanarySectionShellStatesEqual(
              previousShellState,
              unresolvedShellState,
            )
              ? previousShellState
              : unresolvedShellState;
          const previousSectionBodyState =
            previousSectionEntryElement?.sectionBodyState;
          const unresolvedSectionBodyState: SettingsGraphSubstrateCanarySectionEntryBodyState =
            {
              sectionBody,
              sectionId: section.sectionId,
              shouldMountBody,
            };
          const nextSectionBodyState =
            previousSectionBodyState &&
            areSettingsGraphSubstrateCanarySectionEntryBodyStatesEqual(
              previousSectionBodyState,
              unresolvedSectionBodyState,
            )
              ? previousSectionBodyState
              : unresolvedSectionBodyState;
          const canReuseSectionEntryElement =
            previousSectionEntryElement !== undefined &&
            previousSectionEntryElement.sectionId === section.sectionId;
          const nextSectionEntryElement = canReuseSectionEntryElement
            ? previousSectionEntryElement
            : {
                element: (
                  <SettingsGraphSubstrateCanarySectionEntry
                    key={section.sectionId}
                    ref={(shellHandle) =>
                      registerSectionShellHandle(section.sectionId, shellHandle)
                    }
                    finishSectionDrag={finishSectionDrag}
                    handleSectionPointerDown={handleSectionPointerDown}
                    handleSectionPointerMove={handleSectionPointerMove}
                    initialBodyState={nextSectionBodyState}
                    initialShellState={nextShellState}
                    onHoveredSectionChange={onHoveredSectionChange}
                  />
                ),
                sectionBodyState: nextSectionBodyState,
                sectionId: section.sectionId,
                shellState: nextShellState,
              };
          nextSectionEntryElement.sectionBodyState = nextSectionBodyState;
          nextSectionEntryElement.shellState = nextShellState;
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
    registerSectionShellHandle,
    sectionBodiesById,
  ]);

  useLayoutEffect(() => {
    const nextFlushedSectionBodyStatesById = new Map<
      string,
      SettingsGraphSubstrateCanarySectionEntryBodyState
    >();
    const nextFlushedSectionShellStatesById = new Map<
      string,
      SettingsGraphSubstrateCanarySectionShellState
    >();
    for (const [
      sectionId,
      sectionEntryElement,
    ] of stableSectionEntryElementsByIdRef.current) {
      const shellHandle =
        stableSectionShellHandlesByIdRef.current.get(sectionId) ?? null;
      if (!shellHandle) {
        continue;
      }
      const previousFlushedShellState =
        flushedSectionShellStatesByIdRef.current.get(sectionId);
      const previousFlushedBodyState =
        flushedSectionBodyStatesByIdRef.current.get(sectionId);
      const shouldFlushShell =
        previousFlushedShellState !== sectionEntryElement.shellState;
      const shouldFlushBody =
        previousFlushedBodyState !== sectionEntryElement.sectionBodyState;

      if (shouldFlushShell || shouldFlushBody) {
        measureSettingsGraphSubstrateCanaryMotionAttribution(
          "presentedSceneSectionEntryImperativeFlush",
          () => {
            if (shouldFlushShell) {
              shellHandle.updateShell(sectionEntryElement.shellState);
            }
            if (shouldFlushBody) {
              shellHandle.updateBody(sectionEntryElement.sectionBodyState);
            }
          },
        );
      }

      nextFlushedSectionShellStatesById.set(
        sectionId,
        sectionEntryElement.shellState,
      );
      nextFlushedSectionBodyStatesById.set(
        sectionId,
        sectionEntryElement.sectionBodyState,
      );
    }
    flushedSectionShellStatesByIdRef.current =
      nextFlushedSectionShellStatesById;
    flushedSectionBodyStatesByIdRef.current = nextFlushedSectionBodyStatesById;
  });

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
