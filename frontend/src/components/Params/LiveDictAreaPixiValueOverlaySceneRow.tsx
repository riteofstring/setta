import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import type { MouseEvent } from "react";
import { BiError } from "react-icons/bi";
import { openTypeErrorContextMenu } from "state/actions/contextMenus";
import {
  getCodeObjCore,
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
import { ParamInput } from "./ParamItems/ParamInput";
import { ParamNameInput } from "./ParamItems/ParamNameInput";
import { ResizeHandle } from "./ResizeHandle";
import type { LiveDictAreaPixiValueRowTarget } from "./liveDictAreaPixiValueRowTargets";
import {
  PARAM_CONTAINER_COLUMN_WIDTH,
  buildParamContainerLayout,
  buildParamContainerViewModel,
  resolveParamContainerDisplayName,
} from "./paramContainerView";

type LiveDictAreaPixiValueOverlaySceneRowProps = {
  hasSectionStyleTheme: boolean;
  target: LiveDictAreaPixiValueRowTarget;
};

export function LiveDictAreaPixiValueOverlaySceneRow({
  hasSectionStyleTheme,
  target,
}: LiveDictAreaPixiValueOverlaySceneRowProps) {
  const {
    coreNameEditable,
    description,
    displayName,
    name,
    paramIsSelected,
    showParamDisplayNames,
  } = useProjectState((state) => {
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
    const codeObjCore = getCodeObjCore(state, target.rowId);

    return {
      coreNameEditable: codeObjImpl.coreNameEditable,
      description: codeObjImpl.description,
      displayName: codeObjCore.displayName,
      name: codeObjCore.name,
      paramIsSelected: paramsImpl.selectedParams.includes(target.rowId),
      showParamDisplayNames: state.projectConfig.showParamDisplayNames,
    };
  }, _.isEqual);
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
  const paramName = resolveParamContainerDisplayName({
    paramDisplayName: displayName,
    paramName: name,
    preferCoreName: coreNameEditable,
    showParamDisplayNames,
  });
  const viewModel = buildParamContainerViewModel({
    hasChildRows: false,
    hasSectionStyleTheme,
    isNestedParam: false,
    maybeErrorMessage: typeErrorMessage,
    paramDescription: description,
    paramName,
  });
  const floatingBoxHandlers = getFloatingBoxHandlers(
    ...viewModel.tooltipContentArray,
  );
  const selectedBgClassName = hasSectionStyleTheme
    ? "!bg-[color:var(--setta-section-style-outline)] !text-[color:var(--setta-section-style-text)] [&_*]:!text-[color:var(--setta-section-style-text)] active:!bg-[color:var(--setta-section-style-border)]"
    : "active:!bg-cyan-300 !bg-blue-700 [&_*]:!text-white";
  const bg = paramIsSelected
    ? `transition-colors rounded-sm ${selectedBgClassName}`
    : "transition-colors rounded-sm";

  let border = "";
  if (viewModel.hasError) {
    border = "bg-red-200 dark:bg-red-800/30";
  } else if (isFocusedSearchResult) {
    border = "outline outline-4 outline-green-500 dark:outline-green-500/80";
  } else if (isSearchResult) {
    border = "outline outline-4 outline-blue-500 dark:outline-cyan-300/80";
  }

  const { className, style } = buildParamContainerLayout({
    bg,
    border,
    isTopLevelWithPad: false,
    paramHoverClassName: viewModel.paramHoverClassName,
    variant: viewModel.variant,
  });
  const noopMouseHandler = () => {};

  return (
    <div
      data-live-dict-area-editor-overlay-row="true"
      data-live-dict-area-editor-overlay-row-id={target.rowId}
      data-live-dict-area-scene-row-depth={0}
      data-live-dict-area-scene-row-kind="value"
    >
      <article
        id={`ParamContainer-${target.sectionId}-${target.rowId}`}
        className={className}
        style={style}
        data-param-row="true"
        data-param-render-mode="full"
        {...floatingBoxHandlers}
        onMouseDownCapture={noopMouseHandler}
        onClick={noopMouseHandler}
        tabIndex={-1}
        role={undefined}
      >
        <div
          className="section-key overflow-hidden"
          style={{ width: PARAM_CONTAINER_COLUMN_WIDTH }}
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
        </div>
        <ParamInput
          sectionId={target.sectionId}
          paramInfoId={target.rowId}
          maybeErrorMessage={viewModel.errorMessage}
        />
        <ResizeHandle
          showResizeHandle={true}
          onMouseDown={target.handleColumnResizeStart}
        />
        {viewModel.hasError ? (
          <ValueOverlayErrorSection
            sectionId={target.sectionId}
            paramInfoId={target.rowId}
          />
        ) : null}
      </article>
    </div>
  );
}

function ValueOverlayErrorSection({
  sectionId,
  paramInfoId,
}: {
  sectionId: string;
  paramInfoId: string;
}) {
  function onContextMenu(event: MouseEvent<SVGElement>) {
    openTypeErrorContextMenu(event, sectionId, paramInfoId);
  }

  return (
    <BiError
      className="section-key-value grid-row-start-1 group/ w-45overflow-y-clip ml-auto aspect-square  cursor-help rounded-full bg-red-500/80 px-0.5 pb-0.5 pt-[1px] text-white  peer-focus-within/textinput:text-red-100 peer-focus-within/textinput:!opacity-20 dark:bg-red-700/80 dark:peer-focus-within/textinput:text-red-400"
      onContextMenu={onContextMenu}
    />
  );
}
