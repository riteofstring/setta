import { useEffect, useRef } from "react";
import {
  deleteOtherRef,
  deleteSectionRef,
  setOtherRef,
  setSectionRef,
} from "state/actions/sectionRefs";

export function useSectionRefAndInit(sectionId, type) {
  const ref = useRef(null);

  useEffect(() => {
    setSectionRef({ sectionId, [type]: ref.current });
    return () => deleteSectionRef({ sectionId });
  }, []);

  return ref;
}

export function useOtherRefAndInit(id) {
  const ref = useRef(null);

  useEffect(() => {
    setOtherRef(id, ref.current);
    return () => deleteOtherRef(id);
  }, []);

  return ref;
}
