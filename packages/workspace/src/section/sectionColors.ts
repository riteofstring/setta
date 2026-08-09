// Extracted from `getBgColor`/`getOutlineColor` in the frozen reference's Container/utils.tsx.
// The reference's per-application-type bg map and its json-source/global-variables/
// other-project-configs outline branches are application features outside the approved slice;
// slice sections use the default bg and the active/inactive outline pair.
export const DEFAULT_SECTION_BG_COLOR = "bg-setta-50 dark:bg-setta-860";

export function getOutlineColor({ isActiveSection }: { isActiveSection: boolean }) {
  if (isActiveSection) {
    return "outline-blue-600 dark:outline-blue-700";
  }

  return "outline-transparent [&:active:not(:has(button:active,:active.setta-prevent-section-active-css))]:outline-cyan-300";
}
