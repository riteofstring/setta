import { useSectionRefs } from "models/sectionRefs";
import { useEffect, useRef } from "react";

export function useSectionRefAndInit(sectionId) {
  const ref = useRef(null);

  useEffect(() => {
    useSectionRefs.getState().setRef({ sectionId, ref: ref.current });
  }, []);

  return ref;
}
