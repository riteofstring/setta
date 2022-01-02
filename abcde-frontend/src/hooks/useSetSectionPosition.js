import { useStoreState, useStoreActions } from "easy-peasy";
import { useEffect, useRef } from "react";

export function useSetSectionPosition(sectionId) {
  const refForPosition = useRef(null);

  const setSectionPosition = useStoreActions(
    (x) => x.sectionPositions.setSectionPosition
  );

  const setPositionUpdated = useStoreActions(
    (x) => x.sectionPositions.setPositionUpdated
  );

  const setPositionUpdateRequested = useStoreActions(
    (x) => x.sectionPositions.setPositionUpdateRequested
  );

  const positionUpdateRequested = useStoreState(
    (x) => x.sectionPositions.positionUpdateRequested[sectionId]
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
