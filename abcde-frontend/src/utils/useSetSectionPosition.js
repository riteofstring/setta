import { useEffect, useRef } from "react";
import { useStoreState, useStoreActions } from "easy-peasy";

export function useSetSectionPosition(sectionId) {
  const refForPosition = useRef(null);

  const setSectionPosition = useStoreActions(
    (action) => action.sectionPositions.setSectionPosition
  );

  const setPositionUpdated = useStoreActions(
    (action) => action.sectionPositions.setPositionUpdated
  );

  const setPositionUpdateRequested = useStoreActions(
    (action) => action.sectionPositions.setPositionUpdateRequested
  );

  const positionUpdateRequested = useStoreState(
    (state) => state.sectionPositions.positionUpdateRequested[sectionId]
  );

  useEffect(() => {
    if (positionUpdateRequested && refForPosition.current) {
      const { y, x } = refForPosition.current.getBoundingClientRect();
      setSectionPosition({ sectionId, y: y, x: x });
      setPositionUpdateRequested({
        sectionId,
        positionUpdateRequested: false,
      });
      setPositionUpdated({ sectionId, positionUpdated: true });
    }
  }, [positionUpdateRequested]);

  return refForPosition;
}
