import { ADDED, DELETED, UNCHANGED, useKwargDelta } from "models/kwargDelta";
import { useEffect, useState } from "react";
import { useParamRefAndInit } from "./useSectionRefAndInit";
import { useSizeOfResizableRef } from "./useSizeOfResizableElement";

export function useSetParamContainerTempStyle(sectionId, objInfoId) {
  const ref = useParamRefAndInit(sectionId);
  const { height } = useSizeOfResizableRef({ current: ref.current, delay: 0 });
  const kwargDelta = useKwargDelta((x) => {
    const k = x.x[sectionId]?.[objInfoId];
    return k ? k : UNCHANGED;
  });
  const setKwargDelta = useKwargDelta((x) => x.setDelta);
  const [style, setStyle] = useState({});

  useEffect(() => {
    if (kwargDelta === ADDED) {
      setStyle({ minHeight: height });
    } else if (kwargDelta === DELETED) {
      setStyle({ maxHeight: height });
    } else {
      setStyle({});
    }

    if (kwargDelta !== UNCHANGED) {
      setKwargDelta({ sectionId, objInfoId, value: UNCHANGED });
    }
  }, [kwargDelta]);

  return { ref, style };
}
