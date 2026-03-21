export const NESTED_CHILD_ROW_CLASS_NAME =
  "ml-[1.44rem]";

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
