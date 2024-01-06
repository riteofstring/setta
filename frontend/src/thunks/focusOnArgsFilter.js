import { useActiveSection } from "models/activeSection";

export function focusOnArgsFilter() {
  const sectionId = useActiveSection.getState().id;
  if (!sectionId) {
    return;
  }
  const element = document.getElementById(`${sectionId}-args-filter`);
  if (element) {
    element.focus();
  }
}
