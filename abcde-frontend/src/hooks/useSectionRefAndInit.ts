import { useParamRefs, useSectionRefs } from "models/sectionRefs";
import { useEffect, useRef } from "react";

export function useSectionRefAndInit(sectionId) {
  return useStateRefAndInit(sectionId, useSectionRefs);
}

export function useParamRefAndInit(sectionId) {
  return useStateRefAndInit(sectionId, useParamRefs);
}

function useStateRefAndInit(sectionId, state) {
  const ref = useRef(null);
  const setRef = state((x) => x.setRef);

  useEffect(() => {
    setRef({ sectionId, ref: ref.current });
  }, []);

  return ref;
}
