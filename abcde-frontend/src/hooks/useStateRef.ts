import { useSectionRefs } from "models/sectionRefs";
import { useEffect, useRef } from "react";

export function useSectionRefAndInit(sectionId) {
  return useStateRefAndInit(sectionId, useSectionRefs);
}

function useStateRefAndInit(sectionId, state) {
  const ref = useRef(null);

  useEffect(() => {
    state.getState().setRef({ sectionId, ref: ref.current });
  }, []);

  return ref;
}
