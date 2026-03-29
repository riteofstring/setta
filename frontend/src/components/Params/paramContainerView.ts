import type { CSSProperties } from "react";

export const PARAM_CONTAINER_COLUMN_WIDTH = "var(--param-column-width, 200px)";
export const PARAM_CONTAINER_COMPACT_ROW_RADIUS_PX = 2;
export const PARAM_CONTAINER_COMPACT_ROW_HORIZONTAL_PADDING_PX = 2;

const PARAM_CONTAINER_ERROR_WRAPPER_CLASS =
  "!border-red-300 dark:!border-red-900 [&_.tooltip-footer]:!text-red-500 dark:[&_.tooltip-footer]:!text-red-800 dark:[&_.tooltip-footer]:!border-red-950 !bg-red-50/90 dark:!bg-[#120000]/90 [&_.tooltip-copy]:!text-red-400 dark:[&_.tooltip-copy]:!text-red-300 [&>.tooltip-copy]:hover:!bg-transparent";
const PARAM_CONTAINER_ERROR_CONTENT_CLASS =
  "!text-red-700 dark:!text-red-300 font-mono";

export type ParamContainerVariant = "leaf" | "topLevelNested" | "nested";

export type ParamContainerTooltipContent = {
  content?: string;
  title?: string;
  titleClassName?: string;
  wrapperClassName?: string;
  contentClassName?: string;
};

type ResolveParamContainerDisplayNameArgs = {
  showParamDisplayNames: boolean;
  paramName: string;
  paramDisplayName: string;
  preferCoreName: boolean;
};

type BuildParamContainerViewModelArgs = {
  maybeErrorMessage?: string | null;
  paramName: string;
  paramDescription: string;
  isNestedParam: boolean;
  hasChildRows: boolean;
  hasSectionStyleTheme: boolean;
};

type BuildParamContainerLayoutArgs = {
  variant: ParamContainerVariant;
  paramHoverClassName: string;
  bg: string;
  border: string;
  isTopLevelWithPad: boolean;
  dndClassName?: string;
  dndStyle?: CSSProperties;
};

export type ParamContainerViewModel = {
  errorMessage: string;
  hasError: boolean;
  paramHoverClassName: string;
  tooltipContentArray: ParamContainerTooltipContent[];
  variant: ParamContainerVariant;
};

export function resolveParamContainerDisplayName({
  showParamDisplayNames,
  paramName,
  paramDisplayName,
  preferCoreName,
}: ResolveParamContainerDisplayNameArgs): string {
  if (!showParamDisplayNames || preferCoreName) {
    return paramName;
  }

  if (paramDisplayName.trim().length > 0) {
    return paramDisplayName;
  }

  return paramName;
}

export function resolveParamContainerVariant({
  isNestedParam,
  hasChildRows,
}: Pick<
  BuildParamContainerViewModelArgs,
  "hasChildRows" | "isNestedParam"
>): ParamContainerVariant {
  if (!isNestedParam && !hasChildRows) {
    return "leaf";
  }
  if (!isNestedParam) {
    return "topLevelNested";
  }
  return "nested";
}

export function buildParamContainerViewModel({
  maybeErrorMessage,
  paramName,
  paramDescription,
  isNestedParam,
  hasChildRows,
  hasSectionStyleTheme,
}: BuildParamContainerViewModelArgs): ParamContainerViewModel {
  const errorMessage = maybeErrorMessage ?? "";
  const hasError = errorMessage.length > 0;
  const tooltipContentArray = hasError
    ? [
        {
          content: errorMessage,
          wrapperClassName: PARAM_CONTAINER_ERROR_WRAPPER_CLASS,
          contentClassName: PARAM_CONTAINER_ERROR_CONTENT_CLASS,
        },
        {
          title: paramName,
          content: paramDescription,
        },
      ]
    : [{ title: paramName, content: paramDescription }];

  return {
    errorMessage,
    hasError,
    paramHoverClassName: hasSectionStyleTheme
      ? "hover:bg-[color:var(--setta-section-style-border)]"
      : "hover:bg-setta-100/50 hover:dark:bg-setta-800/70",
    tooltipContentArray,
    variant: resolveParamContainerVariant({ isNestedParam, hasChildRows }),
  };
}

export function buildParamContainerLayout({
  variant,
  paramHoverClassName,
  bg,
  border,
  isTopLevelWithPad,
  dndClassName,
  dndStyle,
}: BuildParamContainerLayoutArgs): {
  className: string;
  style: CSSProperties;
} {
  if (variant === "leaf") {
    return {
      className: joinClassNames(
        "section-key-value group/arg-group section-min-rows relative grid min-w-0 items-center rounded-sm px-[2px]",
        paramHoverClassName,
        bg,
        border,
        dndClassName,
      ),
      style: {
        gridTemplateColumns: `minmax(min-content, ${PARAM_CONTAINER_COLUMN_WIDTH}) 0.75rem minmax(0, 1fr)`,
        gridTemplateAreas: '"key center-gutter value"',
        ...(dndStyle ?? {}),
      },
    };
  }

  if (variant === "topLevelNested") {
    return {
      className: joinClassNames(
        "section-args-nested-key-value section-key-value group/arg-group section-min-rows relative grid grid-cols-subgrid items-center justify-between rounded-sm px-[2px]",
        paramHoverClassName,
        bg,
        border,
        dndClassName,
      ),
      style: {
        gridTemplateColumns: `minmax(min-content, ${PARAM_CONTAINER_COLUMN_WIDTH}) [c3] 0.75rem [c4] 1fr [c5]`,
        ...(dndStyle ?? {}),
      },
    };
  }

  return {
    className: joinClassNames(
      "section-args-nested section-lg-value group/arg-group section-min-rows [&>p]:section-key-value relative grid grid-cols-subgrid items-center justify-between gap-y-1 rounded-sm",
      paramHoverClassName,
      bg,
      border,
      isTopLevelWithPad ? "[&>p]:!pb-0 [&>p]:!pt-2" : null,
      dndClassName,
    ),
    style: {
      gridTemplateColumns: `[c1] 0.75rem [c2] minmax(min-content, ${PARAM_CONTAINER_COLUMN_WIDTH}) [c3] 0.75rem [c4] 1fr [c5]`,
      ...(dndStyle ?? {}),
    },
  };
}

function joinClassNames(
  ...classNames: Array<string | null | undefined>
): string {
  return classNames.filter(Boolean).join(" ");
}
