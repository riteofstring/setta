// The reference's viewport toolbar paint (`forks/xyflow/controls/Controls.tsx`), shared by the
// package's own controls and the host controls contributed beside them so a contributed control
// cannot drift from the accepted compact toolbar.
export const ACTIVE_CONTROL_CLASS_NAME =
  "text-white bg-blue-500 dark:text-blue-600 dark:bg-transparent";
export const INACTIVE_CONTROL_CLASS_NAME = "text-setta-400 dark:text-setta-600";
export const TOGGLE_CONTROL_CLASS_NAME =
  "cursor-pointer items-center justify-center overflow-clip rounded-md p-1 hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-setta-500";
// The reference draws this rule after each contributed group, and nowhere else; the groups that
// carried the rest of its dividers left with their features.
export const CONTROLS_DIVIDER_CLASS_NAME =
  "my-0.5 h-px w-full bg-setta-200/70 dark:bg-setta-800/70";
export const DECORATIVE_ICON_PROPS = { "aria-hidden": true, focusable: "false" } as const;
export const COMPACT_TOUCH_TARGET_PROPS = {
  "data-setta-workspace-touch-target": "compact",
} as const;

export function getToggleControlClassName(active: boolean): string {
  return `${TOGGLE_CONTROL_CLASS_NAME} ${active ? ACTIVE_CONTROL_CLASS_NAME : INACTIVE_CONTROL_CLASS_NAME}`;
}
