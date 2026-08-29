export const DEFAULT_SECTION_BG_COLOR = "bg-setta-50 dark:bg-setta-860";

export function getOutlineColor({
  isActiveSection,
}: {
  isActiveSection: boolean;
}) {
  if (isActiveSection) {
    return "outline-blue-600 dark:outline-blue-700";
  }

  return "outline-transparent [&:active:not(:has(button:active,:active.setta-prevent-section-active-css))]:outline-cyan-300";
}
