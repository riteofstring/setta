import _ from "lodash";
import { useEffect, useMemo, useState } from "react";
import { getCurrEffectiveCodeObjImplWithTypeGuard } from "state/actions/sectionInfos";
import { useMisc, useProjectState, useTypeErrors } from "state/definitions";
import { isBaseParamCodeObjImpl } from "utils/generatedTypes";
import {
  LiveDictAreaMount,
  type LiveDictAreaMountProps,
} from "./groupContainerLiveDictAreaMount";
import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import { buildLiveDictAreaPixiDragRowTargets } from "./liveDictAreaPixiDragRowTargets";
import { buildLiveDictAreaPixiFixedMeasurements } from "./liveDictAreaPixiLayout";
import { LiveDictAreaPixiParamAreaOverlay } from "./LiveDictAreaPixiParamAreaOverlay";
import { LiveDictAreaPixiScene } from "./LiveDictAreaPixiScene";
import { LiveDictAreaPixiValueRowOverlay } from "./LiveDictAreaPixiValueRowOverlay";
import { markLiveDictAreaPixiValueRowHandoffStart } from "./liveDictAreaPixiValueRowPerf";
import { buildLiveDictAreaPixiValueRowTargets } from "./liveDictAreaPixiValueRowTargets";

type LiveDictAreaPixiOverlayShellProps = {
  liveDictAreaMountProps: LiveDictAreaMountProps;
  liveDictAreaSceneBoundary: LiveDictAreaSceneBoundary;
};

export function LiveDictAreaPixiOverlayShell({
  liveDictAreaMountProps,
  liveDictAreaSceneBoundary,
}: LiveDictAreaPixiOverlayShellProps) {
  const [activeValueRowId, setActiveValueRowId] = useState<string | null>(null);
  const [activeDragRowId, setActiveDragRowId] = useState<string | null>(null);
  const [isFallbackOverlayActive, setIsFallbackOverlayActive] = useState(false);
  const isSelectingParams = useMisc((state) => state.isSelectingParams);
  const valueRowTargets = useMemo(
    () =>
      buildLiveDictAreaPixiValueRowTargets({
        liveDictAreaMountProps,
        liveDictAreaSceneBoundary,
      }),
    [liveDictAreaMountProps, liveDictAreaSceneBoundary],
  );
  const dragRowTargets = useMemo(
    () =>
      buildLiveDictAreaPixiDragRowTargets({
        liveDictAreaMountProps,
        liveDictAreaSceneBoundary,
      }),
    [liveDictAreaMountProps, liveDictAreaSceneBoundary],
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
      />
      {isSelectingParams
        ? dragRowTargets.map((target) =>
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
          )
        : valueRowTargets.map((target) =>
            target.rowId === activeValueRowId ? null : (
              <button
                key={target.rowId}
                aria-label={`Activate editor overlay for ${target.label}`}
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
