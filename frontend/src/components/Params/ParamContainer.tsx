import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import React from "react";
import { BiError } from "react-icons/bi";
import { openTypeErrorContextMenu } from "state/actions/contextMenus";
import { getCurrEffectiveCodeObjImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { isBaseParamCodeObjImpl } from "utils/generatedTypes";
import { ParamInput } from "./ParamItems/ParamInput";
import { ParamRowShell } from "./ParamRowShell";
import { ResizeHandle } from "./ResizeHandle";

type ParamContainerProps = {
  sectionId: string;
  paramInfoId: string;
  children: React.ReactNode;
  labelShapeKey:
    | "nameInputLeaf"
    | "nameInputParent"
    | "textLabelLeaf"
    | "textLabelParent";
  onResizeStart: React.MouseEventHandler;
  isNestedParam: boolean;
  hasSectionStyleTheme: boolean;
  isTopLevelWithPad?: boolean;
  isNestedChildInTree?: boolean;
  onMouseDown?: React.MouseEventHandler<HTMLElement>;
  onClick?: React.MouseEventHandler<HTMLElement>;
  maybeErrorMessage?: string;
  border?: string;
  bg?: string;
  dndAttributes?: React.HTMLAttributes<HTMLElement>;
  dndListeners?: React.HTMLAttributes<HTMLElement>;
  dndRef?: React.Ref<HTMLElement>;
  dndStyle?: React.CSSProperties;
  dndClassName?: string;
};

function _ParamContainer({
  sectionId,
  paramInfoId,
  children,
  labelShapeKey,
  onResizeStart,
  isNestedParam,
  hasSectionStyleTheme,
  isTopLevelWithPad,
  isNestedChildInTree,
  onMouseDown,
  onClick,
  maybeErrorMessage,
  border,
  bg,
  dndAttributes,
  dndListeners,
  dndRef,
  dndStyle,
  dndClassName,
}: ParamContainerProps) {
  const codeObjImpl = useProjectState((x) =>
    getCurrEffectiveCodeObjImpl(x, sectionId, paramInfoId),
  );
  const paramCore = useProjectState((x) => x.codeObjs[paramInfoId]);
  const showParamDisplayNames = useProjectState(
    (x) => x.projectConfig.showParamDisplayNames,
  );
  const paramDescription = codeObjImpl.description;
  const paramName = React.useMemo(() => {
    if (!showParamDisplayNames) {
      return paramCore.name;
    }
    if (isBaseParamCodeObjImpl(codeObjImpl) && codeObjImpl.coreNameEditable) {
      return paramCore.name;
    }
    const trimmedDisplayName = paramCore.displayName.trim();
    if (trimmedDisplayName.length > 0) {
      return paramCore.displayName;
    }
    return paramCore.name;
  }, [
    codeObjImpl,
    paramCore.displayName,
    paramCore.name,
    showParamDisplayNames,
  ]);

  const errorMessage = maybeErrorMessage ?? "";
  const hasError = errorMessage.length > 0;

  // TODO: fix quick hacky solution below. shouldn't use !important everywhere.
  const tooltipContentArray = hasError
    ? [
        {
          content: errorMessage,
          wrapperClassName:
            "!border-red-300 dark:!border-red-900 [&_.tooltip-footer]:!text-red-500 dark:[&_.tooltip-footer]:!text-red-800 dark:[&_.tooltip-footer]:!border-red-950 !bg-red-50/90 dark:!bg-[#120000]/90 [&_.tooltip-copy]:!text-red-400 dark:[&_.tooltip-copy]:!text-red-300 [&>.tooltip-copy]:hover:!bg-transparent",
          contentClassName: "!text-red-700 dark:!text-red-300 font-mono",
        },
        {
          title: paramName,
          content: paramDescription,
        },
      ]
    : [{ title: paramName, content: paramDescription }];

  const paramHoverClassName = hasSectionStyleTheme
    ? "hover:bg-[color:var(--setta-section-style-border)]"
    : "hover:bg-setta-100/50 hover:dark:bg-setta-800/70";
  const { onMouseEnter, onMouseLeave } = getFloatingBoxHandlers(
    ...tooltipContentArray,
  );

  return (
    <ParamRowShell
      id={`ParamContainer-${sectionId}-${paramInfoId}`} // used for project-level search results
      isNestedChildInTree={isNestedChildInTree}
      isTopLevelWithPad={isTopLevelWithPad}
      extraClassName={`group/arg-group ${paramHoverClassName} ${bg} ${border} ${dndClassName ?? ""}`}
      style={dndStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDownCapture={onMouseDown}
      onClick={onClick}
      dndRef={dndRef}
      dndAttributes={dndAttributes}
      dndListeners={dndListeners}
      tabIndex={-1}
    >
      {children}
      {!isNestedParam && (
        <ParamInput
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          maybeErrorMessage={errorMessage}
        />
      )}
      {!isNestedParam && (
        <ResizeHandle showResizeHandle={true} onMouseDown={onResizeStart} />
      )}
      {!isNestedParam && hasError && (
        <ErrorSection sectionId={sectionId} paramInfoId={paramInfoId} />
      )}
    </ParamRowShell>
  );
}

function areParamContainerPropsEqual(
  prevProps: ParamContainerProps,
  nextProps: ParamContainerProps,
) {
  return (
    prevProps.sectionId === nextProps.sectionId &&
    prevProps.paramInfoId === nextProps.paramInfoId &&
    prevProps.labelShapeKey === nextProps.labelShapeKey &&
    prevProps.onResizeStart === nextProps.onResizeStart &&
    prevProps.isNestedParam === nextProps.isNestedParam &&
    prevProps.hasSectionStyleTheme === nextProps.hasSectionStyleTheme &&
    prevProps.isTopLevelWithPad === nextProps.isTopLevelWithPad &&
    prevProps.isNestedChildInTree === nextProps.isNestedChildInTree &&
    prevProps.onMouseDown === nextProps.onMouseDown &&
    prevProps.onClick === nextProps.onClick &&
    prevProps.maybeErrorMessage === nextProps.maybeErrorMessage &&
    prevProps.border === nextProps.border &&
    prevProps.bg === nextProps.bg &&
    prevProps.dndAttributes === nextProps.dndAttributes &&
    prevProps.dndListeners === nextProps.dndListeners &&
    prevProps.dndRef === nextProps.dndRef &&
    prevProps.dndStyle === nextProps.dndStyle &&
    prevProps.dndClassName === nextProps.dndClassName
  );
}

export const ParamContainer = React.memo(
  _ParamContainer,
  areParamContainerPropsEqual,
);

function ErrorSection({
  sectionId,
  paramInfoId,
}: {
  sectionId: string;
  paramInfoId: string;
}) {
  function onContextMenu(e: React.MouseEvent<SVGElement>) {
    openTypeErrorContextMenu(e, sectionId, paramInfoId);
  }

  return (
    <BiError
      className="param-row-error section-key-value grid-row-start-1 group/ w-45overflow-y-clip ml-auto aspect-square  cursor-help rounded-full bg-red-500/80 px-0.5 pb-0.5 pt-[1px] text-white  peer-focus-within/textinput:text-red-100 peer-focus-within/textinput:!opacity-20 dark:bg-red-700/80 dark:peer-focus-within/textinput:text-red-400"
      onContextMenu={onContextMenu}
    />
  );
}
