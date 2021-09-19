import { useEffect, useRef } from "react";

import { useAtom } from "jotai";
import {
  sectionPosition,
  positionUpdated,
  positionUpdateRequested as positionUpdateRequestedState,
} from "../components/UI/Section/state";
import { useUpdateAtom } from "jotai/utils";

export function useSetSectionPosition(sectionId) {
  const refForPosition = useRef(null);

  const setSectionPosition = useUpdateAtom(sectionPosition(sectionId));
  const setPositionUpdated = useUpdateAtom(positionUpdated(sectionId));
  const [positionUpdateRequested, setPositionUpdateRequested] = useAtom(
    positionUpdateRequestedState(sectionId)
  );

  useEffect(() => {
    if (positionUpdateRequested && refForPosition.current) {
      const { y, x } = refForPosition.current.getBoundingClientRect();
      setSectionPosition({ y: y, x: x });
      setPositionUpdateRequested(false);
      setPositionUpdated(true);
    }
  }, [positionUpdateRequested]);

  return refForPosition;
}
