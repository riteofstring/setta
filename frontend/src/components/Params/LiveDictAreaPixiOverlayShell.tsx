import _ from "lodash";
import { useEffect, useMemo, useState } from "react";
import {
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
import {
  buildLiveDictAreaPixiFixedMeasurements,
  type LiveDictAreaPixiLayout,
} from "./liveDictAreaPixiLayout";
import { LiveDictAreaPixiParamAreaOverlay } from "./LiveDictAreaPixiParamAreaOverlay";
import { LiveDictAreaPixiScene } from "./LiveDictAreaPixiScene";
import { LiveDictAreaPixiValueRowOverlay } from "./LiveDictAreaPixiValueRowOverlay";
import { buildLiveDictAreaPixiEdgeRowTargets } from "./liveDictAreaPixiEdgeRowTargets";
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
  const sceneSectionId = useMemo(
    () => getLiveDictAreaPixiSceneSectionId({ liveDictAreaMountProps }),
    [liveDictAreaMountProps],
  );
  const [summaryLayout, setSummaryLayout] =
    useState<LiveDictAreaPixiLayout | null>(null);
  const [activeValueRowId, setActiveValueRowId] = useState<string | null>(null);
  const [activeDragRowId, setActiveDragRowId] = useState<string | null>(null);
  const [isFallbackOverlayActive, setIsFallbackOverlayActive] = useState(false);
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

  useEffect(() => {
    if (isSelectingParams) {
      setActiveValueRowId(null);
      setIsFallbackOverlayActive(false);
      return;
    }

    setActiveDragRowId(null);
  }, [isSelectingParams]);

  return (
    <>
      <LiveDictAreaPixiFixedMeasurementMarkers
        liveDictAreaSceneBoundary={liveDictAreaSceneBoundary}
      />
      <LiveDictAreaPixiScene
        liveDictAreaSceneBoundary={liveDictAreaSceneBoundary}
        onSummaryLayoutChange={setSummaryLayout}
        sectionId={sceneSectionId}
      />
      {isSelectingParams
        ? [
            ...edgeRowTargets.map((target) => (
              <button
                key={`${target.blockId}-${target.portId}`}
                aria-label={`Select edge input ${target.label}`}
                className="absolute z-[6] cursor-pointer appearance-none border-0 bg-transparent p-0"
                data-live-dict-area-edge-handoff="input-port"
                data-live-dict-area-edge-handoff-block-id={target.blockId}
                data-live-dict-area-edge-handoff-port-id={target.portId}
                data-live-dict-area-edge-handoff-section-id={target.sectionId}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  toggleParamSelected(target.sectionId, target.portId);
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
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
                aria-label={getLiveDictAreaPixiValueRowHandoffAriaLabel(target)}
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
                  setActiveValueRowId(target.rowId);
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
      {isSelectingParams ? (
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
    </>
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
