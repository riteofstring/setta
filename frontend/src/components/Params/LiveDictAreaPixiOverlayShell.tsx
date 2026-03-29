import _ from "lodash";
import { useEffect, useMemo, useState } from "react";
import {
  getCodeObjCore,
  getCurrEffectiveCodeObjImpl,
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
  CodeObjTypeEnum,
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
  buildLiveDictAreaPixiValueOverlayRowStateLookup,
  type LiveDictAreaPixiValueOverlayRowBaseState,
  type LiveDictAreaPixiValueOverlayRowStateLookup,
} from "./liveDictAreaPixiValueOverlayRowState";
import { LiveDictAreaPixiValueRowOverlay } from "./LiveDictAreaPixiValueRowOverlay";
import { buildLiveDictAreaPixiValueRowTargets } from "./liveDictAreaPixiValueRowTargets";
import { resolveParamEditorKind } from "./paramEditorActivation";

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
  const valueRowIds = useMemo(
    () => valueRowTargets.map((target) => target.rowId),
    [valueRowTargets],
  );
  const valueRowSectionId = valueRowTargets[0]?.sectionId ?? null;
  const valueRowEditorKinds = useProjectState((state) => {
    if (isSelectingParams) {
      return {};
    }
    return Object.fromEntries(
      valueRowTargets.map((target) => [
        target.rowId,
        (() => {
          const codeObjImpl = getCurrEffectiveCodeObjImpl(
            state,
            target.sectionId,
            target.rowId,
          );
          return resolveParamEditorKind(codeObjImpl.type, {
            hasColorChoiceMenu:
              codeObjImpl.type === CodeObjTypeEnum.ColorPickerParam &&
              Array.isArray(codeObjImpl.colorChoices) &&
              codeObjImpl.colorChoices.length > 0,
          });
        })(),
      ]),
    );
  }, _.isEqual);
  const valueRowBaseStateById = useProjectState((state) => {
    if (isSelectingParams || valueRowSectionId === null) {
      return {};
    }

    const paramsImpl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      valueRowSectionId,
      isBaseSectionWithParamsImpl,
    );
    const selectedParamIdSet = new Set(paramsImpl.selectedParams);

    return Object.fromEntries(
      valueRowTargets.map((target) => {
        const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuard(
          state,
          target.sectionId,
          target.rowId,
          isBaseParamCodeObjImpl,
        );
        const codeObjCore = getCodeObjCore(state, target.rowId);

        return [
          target.rowId,
          {
            coreNameEditable: codeObjImpl.coreNameEditable,
            description: codeObjImpl.description,
            displayName: codeObjCore.displayName,
            isSelected: selectedParamIdSet.has(target.rowId),
            name: codeObjCore.name,
            showParamDisplayNames: state.projectConfig.showParamDisplayNames,
          } satisfies LiveDictAreaPixiValueOverlayRowBaseState,
        ];
      }),
    );
  }, _.isEqual);
  const valueRowSearchState = useProjectSearch(
    (state) => ({
      focused: state.focused,
      lookup: state.lookup,
    }),
    _.isEqual,
  );
  const valueRowParamErrorsById = useTypeErrors(
    (state) =>
      valueRowSectionId === null
        ? {}
        : state.errors[valueRowSectionId]?.params ?? {},
    _.isEqual,
  );
  const valueRowStateLookup = useMemo(() => {
    if (isSelectingParams || valueRowSectionId === null) {
      return {};
    }

    return buildLiveDictAreaPixiValueOverlayRowStateLookup({
      focusedSearchResult: valueRowSearchState.focused,
      paramErrorsById: valueRowParamErrorsById,
      rowBaseStateById: valueRowBaseStateById,
      rowIds: valueRowIds,
      searchLookup: valueRowSearchState.lookup,
      sectionId: valueRowSectionId,
    });
  }, [
    isSelectingParams,
    valueRowBaseStateById,
    valueRowIds,
    valueRowParamErrorsById,
    valueRowSearchState.focused,
    valueRowSearchState.lookup,
    valueRowSectionId,
  ]);
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
                  right: 0,
                  top: target.y,
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
                  valueRowEditorKinds[target.rowId] ?? "other"
                }
                data-live-dict-area-editor-handoff-row-id={target.rowId}
                onClick={() => {
                  setActiveValueRowId(target.rowId);
                }}
                style={{
                  height: target.height,
                  left: target.x,
                  right: 0,
                  top: target.y,
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
          editorKind={
            valueRowEditorKinds[activeValueRowTarget.rowId] ?? "other"
          }
          hasSectionStyleTheme={activeValueRowHasSectionStyleTheme}
          rowState={getActiveValueRowState({
            rowId: activeValueRowTarget.rowId,
            rowStateLookup: valueRowStateLookup,
          })}
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

function getActiveValueRowState({
  rowId,
  rowStateLookup,
}: {
  rowId: string;
  rowStateLookup: LiveDictAreaPixiValueOverlayRowStateLookup;
}) {
  const rowState = rowStateLookup[rowId];

  if (!rowState) {
    throw new Error(`Missing active Pixi value-overlay state for ${rowId}.`);
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
