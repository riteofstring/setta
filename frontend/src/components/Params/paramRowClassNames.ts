export const NESTED_CHILD_ROW_CLASS_NAME =
  "ml-[1.44rem] before:absolute before:bottom-0 before:left-0 before:h-[calc(100%_-_0.1rem)] before:w-[0.4rem] before:rounded-full before:bg-setta-200/20 before:content-[''] dark:before:bg-setta-400/20";

const NON_NESTED_PARAM_ROW_BASE_CLASS_NAME =
  "section-key-value section-param-row section-min-rows relative ml-[0.72rem] min-w-0 rounded-sm px-[2px]";

export function getNestedChildRowClassName(isNestedChildInTree: boolean) {
  return isNestedChildInTree ? NESTED_CHILD_ROW_CLASS_NAME : "";
}

export function getNonNestedParamRowClassName({
  isNestedChildInTree,
  justifyBetween = false,
  gapY = false,
  extraClassName = "",
}: {
  isNestedChildInTree: boolean;
  justifyBetween?: boolean;
  gapY?: boolean;
  extraClassName?: string;
}) {
  return [
    NON_NESTED_PARAM_ROW_BASE_CLASS_NAME,
    getNestedChildRowClassName(isNestedChildInTree),
    justifyBetween ? "justify-between" : "",
    gapY ? "gap-y-1" : "",
    extraClassName,
  ]
    .filter(Boolean)
    .join(" ");
}
