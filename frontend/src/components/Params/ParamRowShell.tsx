import type {
  AriaRole,
  CSSProperties,
  HTMLAttributes,
  MouseEventHandler,
  ReactNode,
  Ref,
} from "react";
import { getNonNestedParamRowClassName } from "./paramRowClassNames";

type ParamRowShellProps = {
  id?: string;
  isNestedChildInTree: boolean;
  isTopLevelWithPad?: boolean;
  justifyBetween?: boolean;
  gapY?: boolean;
  extraClassName?: string;
  style?: CSSProperties;
  children?: ReactNode;
  dndAttributes?: HTMLAttributes<HTMLElement>;
  dndListeners?: HTMLAttributes<HTMLElement>;
  dndRef?: Ref<HTMLElement>;
  onMouseDownCapture?: MouseEventHandler<HTMLElement>;
  onClick?: MouseEventHandler<HTMLElement>;
  onMouseEnter?: MouseEventHandler<HTMLElement>;
  onMouseLeave?: MouseEventHandler<HTMLElement>;
  tabIndex?: number;
  role?: AriaRole;
};

export function ParamRowShell({
  id,
  isNestedChildInTree,
  isTopLevelWithPad = false,
  justifyBetween = false,
  gapY = false,
  extraClassName = "",
  style,
  children,
  dndAttributes,
  dndListeners,
  dndRef,
  onMouseDownCapture,
  onClick,
  onMouseEnter,
  onMouseLeave,
  tabIndex,
  role,
}: ParamRowShellProps) {
  const className = `${getNonNestedParamRowClassName({
    isNestedChildInTree,
    justifyBetween,
    gapY,
    extraClassName,
  })} ${isTopLevelWithPad ? "pt-2" : ""}`;

  return (
    <article
      id={id}
      className={className}
      style={style}
      data-param-row="true"
      data-param-nested-child={isNestedChildInTree ? "true" : "false"}
      onMouseDownCapture={onMouseDownCapture}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      ref={dndRef}
      {...(dndAttributes ?? {})}
      {...(dndListeners ?? {})}
      tabIndex={tabIndex}
      role={role}
    >
      {children}
    </article>
  );
}
