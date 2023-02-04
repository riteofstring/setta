import { useKwargRefs } from "models/kwargRefs";
import { useSectionRefs } from "models/sectionRefs";
import { useEffect, useRef } from "react";

export function useSectionRefAndInit(sectionId) {
  return useStateRefAndInit(sectionId, useSectionRefs);
}

export function useKwargRefAndinit(sectionId) {
  return useStateRefAndInit(sectionId, useKwargRefs);
}

function useStateRefAndInit(sectionId, state) {
  const ref = useRef(null);
  const setRef = state((x) => x.setRef);

  useEffect(() => {
    setRef({ sectionId, ref: ref.current });
  }, []);

  return ref;
}
