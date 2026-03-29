import _ from "lodash";
import {
  getCurrEffectiveCodeObjImplWithTypeGuard,
  getCurrEffectiveSectionImplWithTypeGuard,
} from "state/actions/sectionInfos";
import {
  useProjectSearch,
  useProjectState,
  useTypeErrors,
} from "state/definitions";
import { createProjectSearchLookupKey } from "state/hooks/search";
import {
  isBaseParamCodeObjImpl,
  isBaseSectionWithParamsImpl,
} from "utils/generatedTypes";
import { ParamContainer } from "./ParamContainer";
import { ParamNameInput } from "./ParamItems/ParamNameInput";
import type { LiveDictAreaPixiValueRowTarget } from "./liveDictAreaPixiValueRowTargets";

type LiveDictAreaPixiValueOverlaySceneRowProps = {
  hasSectionStyleTheme: boolean;
  target: LiveDictAreaPixiValueRowTarget;
};

export function LiveDictAreaPixiValueOverlaySceneRow({
  hasSectionStyleTheme,
  target,
}: LiveDictAreaPixiValueOverlaySceneRowProps) {
  const { coreNameEditable, description, paramIsSelected } = useProjectState(
    (state) => {
      const paramsImpl = getCurrEffectiveSectionImplWithTypeGuard(
        state,
        target.sectionId,
        isBaseSectionWithParamsImpl,
      );
      const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuard(
        state,
        target.sectionId,
        target.rowId,
        isBaseParamCodeObjImpl,
      );

      return {
        coreNameEditable: codeObjImpl.coreNameEditable,
        description: codeObjImpl.description,
        paramIsSelected: paramsImpl.selectedParams.includes(target.rowId),
      };
    },
    _.isEqual,
  );
  const typeErrors = useTypeErrors(
    (state) => state.errors[target.sectionId]?.params?.[target.rowId],
  );
  const { isFocusedSearchResult, isSearchResult } = useProjectSearch(
    (state) => ({
      isFocusedSearchResult:
        state.focused?.sectionId === target.sectionId &&
        state.focused?.paramInfoId === target.rowId,
      isSearchResult: state.lookup.has(
        createProjectSearchLookupKey(target.sectionId, target.rowId),
      ),
    }),
    _.isEqual,
  );

  const typeErrorMessage = typeErrors?.join("\n") ?? "";
  const hasError = typeErrorMessage.length > 0;
  const selectedBgClassName = hasSectionStyleTheme
    ? "!bg-[color:var(--setta-section-style-outline)] !text-[color:var(--setta-section-style-text)] [&_*]:!text-[color:var(--setta-section-style-text)] active:!bg-[color:var(--setta-section-style-border)]"
    : "active:!bg-cyan-300 !bg-blue-700 [&_*]:!text-white";
  const bg = paramIsSelected
    ? `transition-colors rounded-sm ${selectedBgClassName}`
    : "transition-colors rounded-sm";

  let border = "";
  if (hasError) {
    border = "bg-red-200 dark:bg-red-800/30";
  } else if (isFocusedSearchResult) {
    border = "outline outline-4 outline-green-500 dark:outline-green-500/80";
  } else if (isSearchResult) {
    border = "outline outline-4 outline-blue-500 dark:outline-cyan-300/80";
  }

  const noopMouseHandler = () => {};

  return (
    <div
      data-live-dict-area-editor-overlay-row="true"
      data-live-dict-area-editor-overlay-row-id={target.rowId}
      data-live-dict-area-scene-row-depth={0}
      data-live-dict-area-scene-row-kind="value"
    >
      <ParamContainer
        bg={bg}
        border={border}
        hasSectionStyleTheme={hasSectionStyleTheme}
        isKwarg={coreNameEditable}
        isNestedParam={false}
        isTopLevelWithPad={false}
        listKey={target.listKey}
        maybeErrorMessage={typeErrorMessage}
        onClick={noopMouseHandler}
        onMouseDown={noopMouseHandler}
        onResizeStart={target.handleColumnResizeStart}
        paramChildren={[]}
        paramInfoId={target.rowId}
        renderMode="full"
        requiredParamIdsToPaths={target.requiredParamIdsToPaths}
        sectionId={target.sectionId}
      >
        {coreNameEditable ? (
          <ParamNameInput
            bg={bg}
            border={border}
            hasChildren={false}
            onMouseDown={noopMouseHandler}
            paramInfoId={target.rowId}
            sectionId={target.sectionId}
          />
        ) : (
          <p
            className="cursor-text truncate py-[.125rem] font-sans text-xs font-semibold text-setta-800 dark:text-setta-200"
            title={description}
          >
            {target.label}
          </p>
        )}
      </ParamContainer>
    </div>
  );
}
