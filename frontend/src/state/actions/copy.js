import { useActiveSection } from "state/definitions/activeSection";
import { copySections } from "./copySections";

export async function copy() {
  const activeSectionIds = useActiveSection.getState().ids;
  if (activeSectionIds.length > 0 && window.getSelection().toString() === "") {
    const data = copySections(activeSectionIds);
    await navigator.clipboard.writeText(
      JSON.stringify({
        data,
        copyType: "sections",
      }),
    );
  }
}
