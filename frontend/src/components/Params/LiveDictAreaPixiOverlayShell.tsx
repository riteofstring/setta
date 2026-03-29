import _ from "lodash";
import { useEffect, useMemo, useState } from "react";
import {
  getCodeObjCore,
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrEffectiveSectionImplWithTypeGuard,
} from "state/actions/sectionInfos";
import {
  useLocalStorage,
  useMisc,
  useProjectSearch,
  useProjectState,
  useTemporaryMiscState,
  useTypeErrors,
} from "state/definitions";
import { getSectionStylePreviewColorKey } from "utils/constants";
import {
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";
import { deriveSectionStyleTheme } from "utils/sectionStyleColors";
import {
  LiveDictAreaMount,
  type LiveDictAreaMountProps,
} from "./groupContainerLiveDictAreaMount";
import type { LiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import { buildLiveDictAreaPixiDragRowTargets } from "./liveDictAreaPixiDragRowTargets";
import { buildLiveDictAreaPixiFixedMeasurements } from "./liveDictAreaPixiLayout";
import { LiveDictAreaPixiParamAreaOverlay } from "./LiveDictAreaPixiParamAreaOverlay";
import { LiveDictAreaPixiScene } from "./LiveDictAreaPixiScene";
import {
  buildLiveDictAreaPixiValueOverlayRowState,
  type LiveDictAreaPixiValueOverlayRowBaseState,
} from "./liveDictAreaPixiValueOverlayRowState";
import { LiveDictAreaPixiValueRowOverlay } from "./LiveDictAreaPixiValueRowOverlay";
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
  const darkMode = useLocalStorage((state) => state.darkMode);
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
  const activeValueRowBaseState = useProjectState((state) => {
    if (isSelectingParams || activeValueRowTarget === null) {
      return null;
    }

    const paramsImpl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      activeValueRowTarget.sectionId,
      isBaseSectionWithParamsImpl,
    );
    const selectedParamIdSet = new Set(paramsImpl.selectedParams);
    const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuard(
      state,
      activeValueRowTarget.sectionId,
      activeValueRowTarget.rowId,
      isBaseParamCodeObjImpl,
    );
    const codeObjCore = getCodeObjCore(state, activeValueRowTarget.rowId);

    return {
      coreNameEditable: codeObjImpl.coreNameEditable,
      description: codeObjImpl.description,
      displayName: codeObjCore.displayName,
      isSelected: selectedParamIdSet.has(activeValueRowTarget.rowId),
      name: codeObjCore.name,
      showParamDisplayNames: state.projectConfig.showParamDisplayNames,
    } satisfies LiveDictAreaPixiValueOverlayRowBaseState;
  }, _.isEqual);
  const valueRowSearchState = useProjectSearch(
    (state) => ({
      focused: state.focused,
      lookup: state.lookup,
    }),
    _.isEqual,
  );
  const activeValueRowParamErrors = useTypeErrors(
    (state) =>
      activeValueRowTarget === null
        ? []
        : state.errors[activeValueRowTarget.sectionId]?.params?.[
            activeValueRowTarget.rowId
          ] ?? [],
    _.isEqual,
  );
  const activeValueRowState = useMemo(() => {
    if (isSelectingParams || activeValueRowTarget === null) {
      return null;
    }
    if (activeValueRowBaseState === null) {
      throw new Error(
        `Missing active Pixi value-overlay base state for ${activeValueRowTarget.rowId}.`,
      );
    }

    return buildLiveDictAreaPixiValueOverlayRowState({
      focusedSearchResult: valueRowSearchState.focused,
      paramErrors: activeValueRowParamErrors,
      rowBaseState: activeValueRowBaseState,
      rowId: activeValueRowTarget.rowId,
      searchLookup: valueRowSearchState.lookup,
      sectionId: activeValueRowTarget.sectionId,
    });
  }, [
    isSelectingParams,
    activeValueRowBaseState,
    activeValueRowParamErrors,
    activeValueRowTarget,
    valueRowSearchState.focused,
    valueRowSearchState.lookup,
  ]);
  const activeValueRowEditorKind = activeValueRowTarget?.editorKind ?? "other";
  const activeValueRowStyleColorPreview = useTemporaryMiscState((state) => {
    if (activeValueRowTarget === null) {
      return undefined;
    }
    const previewKey = getSectionStylePreviewColorKey(
      activeValueRowTarget.sectionId,
    );
    return state[previewKey] as string | null | undefined;
  });
  const activeValueRowHasSectionStyleTheme = useMemo(() => {
    if (activeValueRowTarget === null) {
      return false;
    }

    const resolvedStyleColor =
      activeValueRowStyleColorPreview === undefined
        ? activeValueRowTarget.styleColor
        : activeValueRowStyleColorPreview;
    return Boolean(
      resolvedStyleColor
        ? deriveSectionStyleTheme(resolvedStyleColor, darkMode)
        : null,
    );
  }, [activeValueRowStyleColorPreview, activeValueRowTarget, darkMode]);

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
          hasSectionStyleTheme={activeValueRowHasSectionStyleTheme}
          rowState={getActiveValueRowState(activeValueRowState)}
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

function getActiveValueRowState(
  rowState: ReturnType<typeof buildLiveDictAreaPixiValueOverlayRowState> | null,
) {
  if (!rowState) {
    throw new Error("Missing active Pixi value-overlay state.");
  }

  return rowState;
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
