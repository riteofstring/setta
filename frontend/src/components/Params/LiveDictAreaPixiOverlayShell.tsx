import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  buildFitViewOnInitState,
  getCurrEffectiveCodeObjImplWithTypeGuard,
  toggleParamSelected,
} from "state/actions/sectionInfos";
import { useMisc, useProjectState, useTypeErrors } from "state/definitions";
import { isBaseParamCodeObjImpl } from "utils/generatedTypes";
import {
  LiveDictAreaMount,
  type LiveDictAreaMountProps,
} from "./groupContainerLiveDictAreaMount";
import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import { buildLiveDictAreaPixiDragRowTargets } from "./liveDictAreaPixiDragRowTargets";
import { buildLiveDictAreaPixiEdgeRowTargets } from "./liveDictAreaPixiEdgeRowTargets";
import {
  buildLiveDictAreaPixiFixedMeasurements,
  type LiveDictAreaPixiLayout,
} from "./liveDictAreaPixiLayout";
import {
  LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAME,
  type LiveDictAreaPixiRegisteredSceneBounds,
  type LiveDictAreaPixiRegisteredSceneSummary,
  useOptionalLiveDictAreaPixiPageRuntime,
} from "./LiveDictAreaPixiPageRuntime";
import { LiveDictAreaPixiParamAreaOverlay } from "./LiveDictAreaPixiParamAreaOverlay";
import type { LiveDictAreaPixiSceneProps } from "./LiveDictAreaPixiScene";
import { LiveDictAreaPixiScene } from "./LiveDictAreaPixiScene";
import { LiveDictAreaPixiValueRowOverlay } from "./LiveDictAreaPixiValueRowOverlay";
import { markLiveDictAreaPixiValueRowHandoffStart } from "./liveDictAreaPixiValueRowPerf";
import {
  buildLiveDictAreaPixiValueRowTargets,
  getLiveDictAreaPixiValueRowHandoffAriaLabel,
} from "./liveDictAreaPixiValueRowTargets";

type LiveDictAreaPixiOverlayShellProps = {
  liveDictAreaMountProps: LiveDictAreaMountProps;
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
};

export function LiveDictAreaPixiOverlayShell({
  liveDictAreaMountProps,
  liveDictAreaSceneBoundary,
}: LiveDictAreaPixiOverlayShellProps) {
  const runtimeSceneId = useId();
  const sceneSectionId = useMemo(
    () => getLiveDictAreaPixiSceneSectionId({ liveDictAreaMountProps }),
    [liveDictAreaMountProps],
  );
  const sceneSectionName = useProjectState(
    (state) =>
      sceneSectionId === null
        ? null
        : state.sections[sceneSectionId]?.name ?? null,
    Object.is,
  );
  const viewportTransform = useReactFlow((state) => state.transform, _.isEqual);
  const liveDictAreaPixiPageRuntime = useOptionalLiveDictAreaPixiPageRuntime();
  const registerScene = liveDictAreaPixiPageRuntime?.registerScene;
  const reportContextLost = liveDictAreaPixiPageRuntime?.reportContextLost;
  const sceneShellRef = useRef<HTMLDivElement | null>(null);
  const [summaryLayout, setSummaryLayout] =
    useState<LiveDictAreaPixiLayout | null>(null);
  const [registeredSceneBounds, setRegisteredSceneBounds] =
    useState<LiveDictAreaPixiRegisteredSceneBounds | null>(null);
  const [activeValueRowId, setActiveValueRowId] = useState<string | null>(null);
  const [activeDragRowId, setActiveDragRowId] = useState<string | null>(null);
  const [focusedValueRowId, setFocusedValueRowId] = useState<string | null>(
    null,
  );
  const [hoveredValueRowId, setHoveredValueRowId] = useState<string | null>(
    null,
  );
  const [pressedValueRowId, setPressedValueRowId] = useState<string | null>(
    null,
  );
  const [focusedEdgePortId, setFocusedEdgePortId] = useState<string | null>(
    null,
  );
  const [hoveredEdgePortId, setHoveredEdgePortId] = useState<string | null>(
    null,
  );
  const [pressedEdgePortId, setPressedEdgePortId] = useState<string | null>(
    null,
  );
  const [isFallbackOverlayActive, setIsFallbackOverlayActive] = useState(false);
  const [hasLostWebglContext, setHasLostWebglContext] = useState(false);
  const requestedInitialNodeDimensionsRef = useRef(false);
  const requestedInitialFitViewRearmRef = useRef(false);
  const isSelectingParams = useMisc((state) => state.isSelectingParams);
  const valueRowTargets = useMemo(
    () =>
      summaryLayout === null
        ? []
        : buildLiveDictAreaPixiValueRowTargets({
            layout: summaryLayout,
            liveDictAreaMountProps,
            liveDictAreaSceneBoundary,
          }),
    [liveDictAreaMountProps, liveDictAreaSceneBoundary, summaryLayout],
  );
  const dragRowTargets = useMemo(
    () =>
      summaryLayout === null
        ? []
        : buildLiveDictAreaPixiDragRowTargets({
            layout: summaryLayout,
            liveDictAreaMountProps,
            liveDictAreaSceneBoundary,
          }),
    [liveDictAreaMountProps, liveDictAreaSceneBoundary, summaryLayout],
  );
  const edgeRowTargets = useMemo(
    () =>
      summaryLayout === null
        ? []
        : buildLiveDictAreaPixiEdgeRowTargets({
            layout: summaryLayout,
            liveDictAreaMountProps,
            liveDictAreaSceneBoundary,
          }),
    [liveDictAreaMountProps, liveDictAreaSceneBoundary, summaryLayout],
  );
  const activeValueRowTarget =
    activeValueRowId === null
      ? null
      : valueRowTargets.find((target) => target.rowId === activeValueRowId) ??
        null;
  const activeDragRowTarget =
    activeDragRowId === null
      ? null
      : dragRowTargets.find((target) => target.rowId === activeDragRowId) ??
        null;
  const edgeRowInteractionState = useMemo<
    NonNullable<LiveDictAreaPixiSceneProps["edgeRowInteractionState"]>
  >(
    () => ({
      focusedPortId: isSelectingParams ? focusedEdgePortId : null,
      hoveredPortId: isSelectingParams ? hoveredEdgePortId : null,
      pressedPortId: isSelectingParams ? pressedEdgePortId : null,
    }),
    [
      focusedEdgePortId,
      hoveredEdgePortId,
      isSelectingParams,
      pressedEdgePortId,
    ],
  );
  const valueRowInteractionState = useMemo<
    NonNullable<LiveDictAreaPixiSceneProps["valueRowInteractionState"]>
  >(
    () => ({
      focusedRowId:
        isSelectingParams || activeValueRowId !== null
          ? null
          : focusedValueRowId,
      hoveredRowId:
        isSelectingParams || activeValueRowId !== null
          ? null
          : hoveredValueRowId,
      pressedRowId:
        isSelectingParams || activeValueRowId !== null
          ? null
          : pressedValueRowId,
    }),
    [
      activeValueRowId,
      focusedValueRowId,
      hoveredValueRowId,
      isSelectingParams,
      pressedValueRowId,
    ],
  );
  const activeValueRowCoreEditState = useProjectState((state) => {
    if (
      isSelectingParams ||
      activeValueRowTarget === null ||
      activeValueRowTarget.editorKind !== "codemirror"
    ) {
      return null;
    }

    const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuard(
      state,
      activeValueRowTarget.sectionId,
      activeValueRowTarget.rowId,
      isBaseParamCodeObjImpl,
    );

    return {
      coreNameEditable: codeObjImpl.coreNameEditable,
    };
  }, _.isEqual);
  const activeValueRowErrorMessage = useTypeErrors(
    (state) =>
      activeValueRowTarget === null
        ? ""
        : state.errors[activeValueRowTarget.sectionId]?.params?.[
            activeValueRowTarget.rowId
          ]?.join("\n") ?? "",
    Object.is,
  );
  const activeValueRowEditorKind = activeValueRowTarget?.editorKind ?? "other";
  const shouldUseValueOnlyCodeMirrorOverlay =
    activeValueRowTarget?.editorKind === "codemirror" &&
    activeValueRowCoreEditState?.coreNameEditable === false &&
    activeValueRowErrorMessage.length === 0;
  const shouldShowDomContextLossFallback = hasLostWebglContext;
  const shouldUseSharedPageRuntimeScene =
    liveDictAreaPixiPageRuntime !== null &&
    sceneSectionName ===
      LIVE_DICT_AREA_PIXI_SHARED_RUNTIME_CANARY_SECTION_NAME &&
    !shouldShowDomContextLossFallback;
  const registeredSceneSummary =
    useMemo<LiveDictAreaPixiRegisteredSceneSummary | null>(
      () =>
        summaryLayout === null
          ? null
          : {
              blockCount: summaryLayout.blocks.length,
              readableRowCount: summaryLayout.readableRowCount,
              totalRowCount: summaryLayout.totalRowCount,
              valuePreviewCount: summaryLayout.valuePreviewCount,
            },
      [summaryLayout],
    );

  useLayoutEffect(() => {
    if (!registerScene) {
      return;
    }

    return registerScene({
      bounds: registeredSceneBounds,
      layout: summaryLayout,
      renderMode: shouldShowDomContextLossFallback
        ? "dom-context-lost"
        : "pixi",
      runtimeSceneId,
      sceneBoundary: liveDictAreaSceneBoundary,
      sectionId: sceneSectionId,
      sectionName: sceneSectionName,
      styleSourceElement: sceneShellRef.current,
      summary: registeredSceneSummary,
    });
  }, [
    liveDictAreaSceneBoundary,
    registerScene,
    sceneSectionName,
    registeredSceneBounds,
    summaryLayout,
    registeredSceneSummary,
    runtimeSceneId,
    sceneSectionId,
    shouldShowDomContextLossFallback,
  ]);

  useLayoutEffect(() => {
    const sceneShell = sceneShellRef.current;
    if (!sceneShell) {
      setRegisteredSceneBounds(null);
      return;
    }

    const updateBounds = () => {
      const nextBounds = readRegisteredSceneBounds(sceneShell);
      setRegisteredSceneBounds((currentBounds) =>
        areRegisteredSceneBoundsEqual(currentBounds, nextBounds)
          ? currentBounds
          : nextBounds,
      );
    };

    updateBounds();

    const observer = new ResizeObserver(() => {
      updateBounds();
    });
    observer.observe(sceneShell);
    window.addEventListener("resize", updateBounds);
    window.addEventListener("scroll", updateBounds, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateBounds);
      window.removeEventListener("scroll", updateBounds, true);
    };
  }, [viewportTransform]);

  useEffect(() => {
    if (summaryLayout === null) {
      requestedInitialNodeDimensionsRef.current = false;
      requestedInitialFitViewRearmRef.current = false;
      return;
    }

    if (!requestedInitialNodeDimensionsRef.current) {
      requestedInitialNodeDimensionsRef.current = true;
      useMisc.setState({ requestUpdateNodeDimensions: true });
    }

    if (requestedInitialFitViewRearmRef.current) {
      return;
    }

    const projectConfig = useProjectState.getState().projectConfig;
    if (projectConfig.viewportInitialized) {
      requestedInitialFitViewRearmRef.current = true;
      return;
    }

    const reactFlowState = useReactFlow.getState();
    if (reactFlowState.fitViewOnInit && !reactFlowState.fitViewOnInitDone) {
      return;
    }

    requestedInitialFitViewRearmRef.current = true;
    useReactFlow.setState(buildFitViewOnInitState(useProjectState.getState()));
    useMisc.setState({ requestUpdateNodeDimensions: true });
  }, [summaryLayout]);

  useEffect(() => {
    if (isSelectingParams) {
      setActiveValueRowId(null);
      setFocusedValueRowId(null);
      setHoveredValueRowId(null);
      setPressedValueRowId(null);
      setIsFallbackOverlayActive(false);
      return;
    }

    setActiveDragRowId(null);
    setFocusedValueRowId(null);
    setHoveredValueRowId(null);
    setPressedValueRowId(null);
    setFocusedEdgePortId(null);
    setHoveredEdgePortId(null);
    setPressedEdgePortId(null);
  }, [isSelectingParams]);

  useEffect(() => {
    setHasLostWebglContext(false);
  }, [sceneSectionId]);

  useEffect(() => {
    if (!hasLostWebglContext) {
      return;
    }

    setSummaryLayout(null);
    setActiveValueRowId(null);
    setActiveDragRowId(null);
    setFocusedValueRowId(null);
    setHoveredValueRowId(null);
    setPressedValueRowId(null);
    setFocusedEdgePortId(null);
    setHoveredEdgePortId(null);
    setPressedEdgePortId(null);
    setIsFallbackOverlayActive(false);
  }, [hasLostWebglContext]);

  useEffect(() => {
    if (activeValueRowId === null) {
      return;
    }

    setFocusedValueRowId(null);
    setHoveredValueRowId(null);
    setPressedValueRowId(null);
  }, [activeValueRowId]);

  useEffect(() => {
    const validRowIds = new Set(valueRowTargets.map((target) => target.rowId));
    setFocusedValueRowId((currentRowId) =>
      currentRowId && !validRowIds.has(currentRowId) ? null : currentRowId,
    );
    setHoveredValueRowId((currentRowId) =>
      currentRowId && !validRowIds.has(currentRowId) ? null : currentRowId,
    );
    setPressedValueRowId((currentRowId) =>
      currentRowId && !validRowIds.has(currentRowId) ? null : currentRowId,
    );
  }, [valueRowTargets]);

  useEffect(() => {
    const validPortIds = new Set(edgeRowTargets.map((target) => target.portId));
    setFocusedEdgePortId((currentPortId) =>
      currentPortId && !validPortIds.has(currentPortId) ? null : currentPortId,
    );
    setHoveredEdgePortId((currentPortId) =>
      currentPortId && !validPortIds.has(currentPortId) ? null : currentPortId,
    );
    setPressedEdgePortId((currentPortId) =>
      currentPortId && !validPortIds.has(currentPortId) ? null : currentPortId,
    );
  }, [edgeRowTargets]);

  return (
    <>
      <LiveDictAreaPixiFixedMeasurementMarkers
        liveDictAreaSceneBoundary={liveDictAreaSceneBoundary}
      />
      <div
        className="relative min-h-0 min-w-0 !max-w-full flex-1 overflow-hidden"
        data-live-dict-area-pixi-clipping-container="true"
        ref={sceneShellRef}
      >
        {shouldShowDomContextLossFallback ? (
          <div
            className="absolute inset-0 z-20 overflow-y-auto"
            data-live-dict-area-scene-fallback="dom-context-lost"
            data-live-dict-area-scene-fallback-runtime-scene-id={runtimeSceneId}
            data-live-dict-area-scene-fallback-section-id={
              sceneSectionId ?? undefined
            }
            data-live-dict-area-scene-fallback-section-name={
              sceneSectionName ?? undefined
            }
          >
            <LiveDictAreaMount {...liveDictAreaMountProps} />
          </div>
        ) : (
          <LiveDictAreaPixiScene
            edgeRowInteractionState={edgeRowInteractionState}
            liveDictAreaSceneBoundary={liveDictAreaSceneBoundary}
            onSummaryLayoutChange={setSummaryLayout}
            onWebglContextLost={() => {
              reportContextLost?.({
                runtimeSceneId,
                sectionId: sceneSectionId,
              });
              setHasLostWebglContext(true);
            }}
            renderBackend={
              shouldUseSharedPageRuntimeScene
                ? "shared-page-runtime"
                : "local-app"
            }
            sectionId={sceneSectionId}
            sectionName={sceneSectionName}
            valueRowInteractionState={valueRowInteractionState}
          />
        )}
        {shouldShowDomContextLossFallback
          ? null
          : isSelectingParams
            ? [
                ...edgeRowTargets.map((target) => (
                  <button
                    key={`${target.blockId}-${target.portId}`}
                    aria-label={`Select edge input ${target.label}`}
                    className="absolute z-[6] cursor-pointer appearance-none border-0 bg-transparent p-0"
                    data-live-dict-area-edge-handoff="input-port"
                    data-live-dict-area-edge-handoff-block-id={target.blockId}
                    data-live-dict-area-edge-handoff-port-id={target.portId}
                    data-live-dict-area-edge-handoff-section-id={
                      target.sectionId
                    }
                    data-live-dict-area-edge-handoff-selected={
                      target.isSelected ? "true" : "false"
                    }
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setPressedEdgePortId(null);
                      toggleParamSelected(target.sectionId, target.portId);
                    }}
                    onFocus={() => {
                      setFocusedEdgePortId(target.portId);
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setPressedEdgePortId(target.portId);
                    }}
                    onMouseEnter={() => {
                      setHoveredEdgePortId(target.portId);
                    }}
                    onMouseLeave={() => {
                      setHoveredEdgePortId((currentPortId) =>
                        currentPortId === target.portId ? null : currentPortId,
                      );
                      setPressedEdgePortId((currentPortId) =>
                        currentPortId === target.portId ? null : currentPortId,
                      );
                    }}
                    onMouseUp={() => {
                      setPressedEdgePortId((currentPortId) =>
                        currentPortId === target.portId ? null : currentPortId,
                      );
                    }}
                    onBlur={() => {
                      setFocusedEdgePortId((currentPortId) =>
                        currentPortId === target.portId ? null : currentPortId,
                      );
                    }}
                    style={{
                      height: target.height,
                      left: target.x,
                      top: target.y,
                      width: target.width,
                    }}
                    type="button"
                  />
                )),
                ...dragRowTargets.map((target) =>
                  target.rowId === activeDragRowId ? null : (
                    <button
                      key={target.rowId}
                      aria-label={`Activate drag overlay for ${target.label}`}
                      className="absolute z-[5] cursor-grab appearance-none border-0 bg-transparent p-0"
                      data-live-dict-area-drag-handoff="param-row"
                      data-live-dict-area-drag-handoff-block-id={target.blockId}
                      data-live-dict-area-drag-handoff-row-id={target.rowId}
                      onClick={() => {
                        setActiveDragRowId(target.rowId);
                      }}
                      style={{
                        height: target.height,
                        left: target.x,
                        top: target.y,
                        width: target.width,
                      }}
                      type="button"
                    />
                  ),
                ),
              ]
            : valueRowTargets.map((target) =>
                target.rowId === activeValueRowId ? null : (
                  <button
                    key={target.rowId}
                    aria-label={getLiveDictAreaPixiValueRowHandoffAriaLabel(
                      target,
                    )}
                    className="absolute z-[5] cursor-text appearance-none border-0 bg-transparent p-0"
                    data-live-dict-area-editor-handoff="value-row"
                    data-live-dict-area-editor-handoff-editor-kind={
                      target.editorKind
                    }
                    data-live-dict-area-editor-handoff-row-id={target.rowId}
                    onClick={() => {
                      markLiveDictAreaPixiValueRowHandoffStart({
                        editorKind: target.editorKind,
                        rowId: target.rowId,
                      });
                      setPressedValueRowId(null);
                      setActiveValueRowId(target.rowId);
                    }}
                    onFocus={() => {
                      setFocusedValueRowId(target.rowId);
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setPressedValueRowId(target.rowId);
                    }}
                    onMouseEnter={() => {
                      setHoveredValueRowId(target.rowId);
                    }}
                    onMouseLeave={() => {
                      setHoveredValueRowId((currentRowId) =>
                        currentRowId === target.rowId ? null : currentRowId,
                      );
                      setPressedValueRowId((currentRowId) =>
                        currentRowId === target.rowId ? null : currentRowId,
                      );
                    }}
                    onMouseUp={() => {
                      setPressedValueRowId((currentRowId) =>
                        currentRowId === target.rowId ? null : currentRowId,
                      );
                    }}
                    onBlur={() => {
                      setFocusedValueRowId((currentRowId) =>
                        currentRowId === target.rowId ? null : currentRowId,
                      );
                    }}
                    style={{
                      height: target.height,
                      left: target.x,
                      top: target.y,
                      width: target.width,
                    }}
                    type="button"
                  />
                ),
              )}
        {shouldShowDomContextLossFallback ? null : isSelectingParams ? (
          activeDragRowTarget ? (
            <LiveDictAreaPixiParamAreaOverlay
              liveDictAreaMountProps={liveDictAreaMountProps}
              target={activeDragRowTarget}
            />
          ) : null
        ) : activeValueRowTarget ? (
          <LiveDictAreaPixiValueRowOverlay
            editorKind={activeValueRowEditorKind}
            errorMessage={activeValueRowErrorMessage}
            overlaySurface={
              shouldUseValueOnlyCodeMirrorOverlay ? "value-only" : "full-row"
            }
            target={activeValueRowTarget}
          />
        ) : valueRowTargets.length === 0 ? (
          isFallbackOverlayActive ? (
            <div
              className="absolute inset-0 z-20 overflow-y-auto"
              data-live-dict-area-editor-overlay="active"
              data-live-dict-area-editor-overlay-kind="full-shell"
            >
              <LiveDictAreaMount {...liveDictAreaMountProps} />
            </div>
          ) : (
            <button
              aria-label="Activate live dict-area editor overlay"
              className="absolute inset-0 z-[5] appearance-none border-0 bg-transparent p-0"
              data-live-dict-area-editor-handoff="available"
              onClick={() => {
                setIsFallbackOverlayActive(true);
              }}
              type="button"
            />
          )
        ) : null}
      </div>
    </>
  );
}

function readRegisteredSceneBounds(
  sceneShell: HTMLDivElement,
): LiveDictAreaPixiRegisteredSceneBounds | null {
  const rect = sceneShell.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
    return null;
  }
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  return {
    height: Math.round(rect.height),
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    width: Math.round(rect.width),
  };
}

function areRegisteredSceneBoundsEqual(
  currentBounds: LiveDictAreaPixiRegisteredSceneBounds | null,
  nextBounds: LiveDictAreaPixiRegisteredSceneBounds | null,
) {
  if (currentBounds === nextBounds) {
    return true;
  }
  if (!currentBounds || !nextBounds) {
    return false;
  }

  return (
    currentBounds.height === nextBounds.height &&
    currentBounds.left === nextBounds.left &&
    currentBounds.top === nextBounds.top &&
    currentBounds.width === nextBounds.width
  );
}

function getLiveDictAreaPixiSceneSectionId({
  liveDictAreaMountProps,
}: {
  liveDictAreaMountProps: LiveDictAreaMountProps;
}) {
  const sectionIds = [
    ...new Set(
      liveDictAreaMountProps.liveDictAreaSurface.blocks.map(
        (block) => block.props.sectionId,
      ),
    ),
  ];

  if (sectionIds.length === 0) {
    return null;
  }

  const sectionId = sectionIds[0];
  if (sectionId === undefined) {
    throw new Error("Expected a live dict-area section id for the Pixi scene.");
  }
  if (sectionIds.length !== 1) {
    throw new Error(
      `Expected a single live dict-area section id for the Pixi scene, received ${sectionIds.join(", ")}.`,
    );
  }

  return sectionId;
}

function LiveDictAreaPixiFixedMeasurementMarkers({
  liveDictAreaSceneBoundary,
}: {
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
}) {
  const measurements = buildLiveDictAreaPixiFixedMeasurements({
    liveDictAreaSceneBoundary,
  });

  if (measurements.length === 0) {
    return null;
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 w-px opacity-0"
    >
      {measurements.map((measurement) => (
        <div
          key={measurement.blockId}
          data-live-dict-area-fixed-measurement={measurement.blockId}
          data-params-fixed="true"
          style={{ height: `${measurement.height}px` }}
        />
      ))}
    </div>
  );
}
