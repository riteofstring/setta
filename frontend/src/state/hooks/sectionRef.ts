import { useEffect, useRef } from "react";
import { deleteSectionRef, setSectionRef } from "state/actions/sectionRefs";

export type SectionRefRegistrationMode = "selfOnly" | "withNested" | "none";

export function useSectionRefAndInit(
  sectionId,
  type: SectionRefRegistrationMode,
) {
  const ref = useRef(null);

  useEffect(() => {
    if (type === "none") {
      return;
    }
    setSectionRef({ sectionId, [type]: ref.current });
    return () => deleteSectionRef({ sectionId });
  }, [sectionId, type]);

  return ref;
}
