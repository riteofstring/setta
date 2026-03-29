import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import type { MouseEvent } from "react";
import { BiError } from "react-icons/bi";
import { openTypeErrorContextMenu } from "state/actions/contextMenus";
import { ParamInput } from "./ParamItems/ParamInput";
import { ParamNameInput } from "./ParamItems/ParamNameInput";
import { ResizeHandle } from "./ResizeHandle";
import type { LiveDictAreaPixiValueOverlayRowState } from "./liveDictAreaPixiValueOverlayRowState";
import { markLiveDictAreaPixiValueRowEditorReady } from "./liveDictAreaPixiValueRowPerf";
import type { LiveDictAreaPixiValueRowTarget } from "./liveDictAreaPixiValueRowTargets";
import {
  PARAM_CONTAINER_COLUMN_WIDTH,
  buildParamContainerLayout,
  buildParamContainerViewModel,
} from "./paramContainerView";

type LiveDictAreaPixiValueOnlyOverlaySceneRowProps = {
  errorMessage: string;
  overlaySurface: "value-only";
  target: LiveDictAreaPixiValueRowTarget;
};

type LiveDictAreaPixiValueFullOverlaySceneRowProps = {
  hasSectionStyleTheme: boolean;
  overlaySurface: "full-row";
  rowState: LiveDictAreaPixiValueOverlayRowState;
  target: LiveDictAreaPixiValueRowTarget;
};

type LiveDictAreaPixiValueOverlaySceneRowProps =
  | LiveDictAreaPixiValueOnlyOverlaySceneRowProps
  | LiveDictAreaPixiValueFullOverlaySceneRowProps;

export function LiveDictAreaPixiValueOverlaySceneRow({
  target,
  ...props
}: LiveDictAreaPixiValueOverlaySceneRowProps) {
  const onAutoActivatedCodeMirrorReady =
    target.editorKind === "codemirror"
      ? () => {
          markLiveDictAreaPixiValueRowEditorReady({
            editorKind: target.editorKind,
            rowId: target.rowId,
          });
        }
      : undefined;
  const noopMouseHandler = () => {};
  if (props.overlaySurface === "value-only") {
    const { className, style } = buildParamContainerLayout({
      bg: "",
      border: "",
      isTopLevelWithPad: false,
      paramHoverClassName: "",
      variant: "leaf",
    });

    return (
      <article
        id={`ParamContainer-${target.sectionId}-${target.rowId}`}
        className={className}
        style={style}
        data-live-dict-area-editor-overlay-row="true"
        data-live-dict-area-editor-overlay-row-id={target.rowId}
        data-live-dict-area-editor-overlay-row-surface="value-only"
        data-live-dict-area-scene-row-depth={0}
        data-live-dict-area-scene-row-kind="value"
        data-param-row="true"
        data-param-render-mode="full"
        onMouseDownCapture={noopMouseHandler}
        onClick={noopMouseHandler}
        tabIndex={-1}
        role={undefined}
      >
        <ParamInput
          sectionId={target.sectionId}
          paramInfoId={target.rowId}
          maybeErrorMessage={props.errorMessage}
          onAutoActivatedCodeMirrorReady={onAutoActivatedCodeMirrorReady}
        />
      </article>
    );
  }

  const { hasSectionStyleTheme, rowState } = props;
  const viewModel = buildParamContainerViewModel({
    hasChildRows: false,
    hasSectionStyleTheme,
    isNestedParam: false,
    maybeErrorMessage: rowState.errorMessage,
    paramDescription: rowState.description,
    paramName: rowState.paramName,
  });
  const floatingBoxHandlers = getFloatingBoxHandlers(
    ...viewModel.tooltipContentArray,
  );
  const selectedBgClassName = hasSectionStyleTheme
    ? "!bg-[color:var(--setta-section-style-outline)] !text-[color:var(--setta-section-style-text)] [&_*]:!text-[color:var(--setta-section-style-text)] active:!bg-[color:var(--setta-section-style-border)]"
    : "active:!bg-cyan-300 !bg-blue-700 [&_*]:!text-white";
  const bg = rowState.isSelected
    ? `transition-colors rounded-sm ${selectedBgClassName}`
    : "transition-colors rounded-sm";

  let border = "";
  if (viewModel.hasError) {
    border = "bg-red-200 dark:bg-red-800/30";
  } else if (rowState.isFocusedSearchResult) {
    border = "outline outline-4 outline-green-500 dark:outline-green-500/80";
  } else if (rowState.isSearchResult) {
    border = "outline outline-4 outline-blue-500 dark:outline-cyan-300/80";
  }

  const { className, style } = buildParamContainerLayout({
    bg,
    border,
    isTopLevelWithPad: false,
    paramHoverClassName: viewModel.paramHoverClassName,
    variant: viewModel.variant,
  });

  return (
    <article
      id={`ParamContainer-${target.sectionId}-${target.rowId}`}
      className={className}
      style={style}
      data-live-dict-area-editor-overlay-row="true"
      data-live-dict-area-editor-overlay-row-id={target.rowId}
      data-live-dict-area-editor-overlay-row-surface="full-row"
      data-live-dict-area-scene-row-depth={0}
      data-live-dict-area-scene-row-kind="value"
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
        {rowState.coreNameEditable ? (
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
            title={rowState.description}
          >
            {rowState.paramName}
          </p>
        )}
      </div>
      <ParamInput
        sectionId={target.sectionId}
        paramInfoId={target.rowId}
        maybeErrorMessage={viewModel.errorMessage}
        onAutoActivatedCodeMirrorReady={onAutoActivatedCodeMirrorReady}
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
