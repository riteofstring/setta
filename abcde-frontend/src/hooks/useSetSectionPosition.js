import { useSectionPositions } from "models/sectionPositions";
import { useEffect, useRef } from "react";

export function useSetSectionPosition(sectionId) {
  const refForPosition = useRef(null);

  const setSectionPosition = useSectionPositions((x) => x.setSectionPosition);

  const setPositionUpdated = useSectionPositions((x) => x.setPositionUpdated);

  const setPositionUpdateRequested = useSectionPositions(
    (x) => x.setPositionUpdateRequested
  );

  const positionUpdateRequested = useSectionPositions(
    (x) => x.positionUpdateRequested[sectionId]
  );

  useEffect(() => {
    if (positionUpdateRequested && refForPosition.current) {
      const { y, x } = refForPosition.current.getBoundingClientRect();
      const sectionIds = [sectionId];
      setSectionPosition({ sectionId, y: y, x: x });
      setPositionUpdateRequested({
        sectionIds,
        positionUpdateRequested: false,
      });
      setPositionUpdated({ sectionIds, positionUpdated: true });
    }
  }, [positionUpdateRequested]);

  return refForPosition;
}
