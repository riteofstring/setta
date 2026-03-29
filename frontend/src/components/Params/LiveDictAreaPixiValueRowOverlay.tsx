import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { useLayoutEffect, useMemo } from "react";
import {
  getCodeObjCore,
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrEffectiveSectionImplWithTypeGuard,
} from "state/actions/sectionInfos";
import {
  useLocalStorage,
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
import type { LiveDictAreaPixiValueOverlayRowState } from "./liveDictAreaPixiValueOverlayRowState";
import {
  buildLiveDictAreaPixiValueOverlayRowState,
  type LiveDictAreaPixiValueOverlayRowBaseState,
} from "./liveDictAreaPixiValueOverlayRowState";
import { LiveDictAreaPixiValueOverlaySceneRow } from "./LiveDictAreaPixiValueOverlaySceneRow";
import { buildLiveDictAreaPixiValueRowOverlayStyle } from "./liveDictAreaPixiValueRowOverlayView";
import { markLiveDictAreaPixiValueRowOverlayMounted } from "./liveDictAreaPixiValueRowPerf";
import type { LiveDictAreaPixiValueRowTarget } from "./liveDictAreaPixiValueRowTargets";
import {
  type ParamEditorKind,
  PixiOverlayParamEditorKindProvider,
} from "./paramEditorActivation";

type LiveDictAreaPixiValueOnlyRowOverlayProps = {
  editorKind: ParamEditorKind;
  errorMessage: string;
  overlaySurface: "value-only";
  target: LiveDictAreaPixiValueRowTarget;
};

type LiveDictAreaPixiValueFullRowOverlayProps = {
  editorKind: ParamEditorKind;
  overlaySurface: "full-row";
  target: LiveDictAreaPixiValueRowTarget;
};

type LiveDictAreaPixiValueRowOverlayProps =
  | LiveDictAreaPixiValueOnlyRowOverlayProps
  | LiveDictAreaPixiValueFullRowOverlayProps;

export function LiveDictAreaPixiValueRowOverlay({
  editorKind,
  target,
  ...props
}: LiveDictAreaPixiValueRowOverlayProps) {
  const viewportZoom = useReactFlow((state) => state.transform[2]);

  useLayoutEffect(() => {
    markLiveDictAreaPixiValueRowOverlayMounted({
      editorKind,
      rowId: target.rowId,
    });
  }, [editorKind, target.rowId]);

  return (
    <PixiOverlayParamEditorKindProvider value={editorKind}>
      <div
        className="pointer-events-auto absolute z-20"
        data-live-dict-area-editor-overlay="active"
        data-live-dict-area-editor-overlay-editor-kind={editorKind}
        data-live-dict-area-editor-overlay-kind="value-row"
        data-live-dict-area-editor-overlay-row-id={target.rowId}
        style={buildLiveDictAreaPixiValueRowOverlayStyle({
          editorKind,
          target,
          viewportZoom,
        })}
      >
        <div className="min-h-0 w-full pr-1.5">
          {props.overlaySurface === "value-only" ? (
            <LiveDictAreaPixiValueOverlaySceneRow
              errorMessage={props.errorMessage}
              overlaySurface="value-only"
              target={target}
            />
          ) : (
            <ConnectedLiveDictAreaPixiValueFullOverlayRow target={target} />
          )}
        </div>
      </div>
    </PixiOverlayParamEditorKindProvider>
  );
}

function ConnectedLiveDictAreaPixiValueFullOverlayRow({
  target,
}: {
  target: LiveDictAreaPixiValueRowTarget;
}) {
  const darkMode = useLocalStorage((state) => state.darkMode);
  const rowBaseState = useProjectState((state) => {
    const paramsImpl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      target.sectionId,
      isBaseSectionWithParamsImpl,
    );
    const selectedParamIdSet = new Set(paramsImpl.selectedParams);
    const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuard(
      state,
      target.sectionId,
      target.rowId,
      isBaseParamCodeObjImpl,
    );
    const codeObjCore = getCodeObjCore(state, target.rowId);

    return {
      coreNameEditable: codeObjImpl.coreNameEditable,
      description: codeObjImpl.description,
      displayName: codeObjCore.displayName,
      isSelected: selectedParamIdSet.has(target.rowId),
      name: codeObjCore.name,
      showParamDisplayNames: state.projectConfig.showParamDisplayNames,
    } satisfies LiveDictAreaPixiValueOverlayRowBaseState;
  }, _.isEqual);
  const searchState = useProjectSearch(
    (state) => ({
      focused: state.focused,
      lookup: state.lookup,
    }),
    _.isEqual,
  );
  const errorMessage = useTypeErrors(
    (state) =>
      state.errors[target.sectionId]?.params?.[target.rowId]?.join("\n") ?? "",
    Object.is,
  );
  const styleColorPreview = useTemporaryMiscState((state) => {
    const previewKey = getSectionStylePreviewColorKey(target.sectionId);
    return state[previewKey] as string | null | undefined;
  });
  const hasSectionStyleTheme = useMemo(() => {
    const resolvedStyleColor =
      styleColorPreview === undefined ? target.styleColor : styleColorPreview;
    return Boolean(
      resolvedStyleColor
        ? deriveSectionStyleTheme(resolvedStyleColor, darkMode)
        : null,
    );
  }, [darkMode, styleColorPreview, target.styleColor]);
  const rowState = useMemo(
    (): LiveDictAreaPixiValueOverlayRowState =>
      buildLiveDictAreaPixiValueOverlayRowState({
        focusedSearchResult: searchState.focused,
        paramErrors: errorMessage.length === 0 ? [] : errorMessage.split("\n"),
        rowBaseState,
        rowId: target.rowId,
        searchLookup: searchState.lookup,
        sectionId: target.sectionId,
      }),
    [
      errorMessage,
      rowBaseState,
      searchState.focused,
      searchState.lookup,
      target.rowId,
      target.sectionId,
    ],
  );

  return (
    <LiveDictAreaPixiValueOverlaySceneRow
      hasSectionStyleTheme={hasSectionStyleTheme}
      overlaySurface="full-row"
      rowState={rowState}
      target={target}
    />
  );
}
