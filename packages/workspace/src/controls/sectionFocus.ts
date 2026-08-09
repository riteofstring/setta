import { useSectionRefs } from "../section/sectionRefs";

// The reference's `focusOnSection(null, sectionId, false)` without its pane-move travel —
// canvas focus/fit helpers are a deferred capability. Every built-in control routes its Escape
// here: moving focus to the section container blurs the live control, which restores the idle
// presentation without unselecting the section.
export function focusSectionAfterEscape(sectionId: string) {
  const sectionRef = useSectionRefs.getState().withNested[sectionId];
  if (!sectionRef) {
    return;
  }
  sectionRef.focus({ preventScroll: true });
}
