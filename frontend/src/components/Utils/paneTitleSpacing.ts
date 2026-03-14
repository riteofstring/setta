export const RIGHT_PANE_TITLE_CLEARANCE_CLASS_NAME = "pl-10";

export function withRightPaneTitleClearance(baseClassName: string): string {
  return `${baseClassName} ${RIGHT_PANE_TITLE_CLEARANCE_CLASS_NAME}`;
}
