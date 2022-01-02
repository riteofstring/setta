import { useStoreActions, useStoreState } from "easy-peasy";
import { useEffect, useState } from "react";
import { PANEID } from "utils/constants";

export function useRequestSectionPositionUpdate(sectionId) {
  const setPositionUpdateRequested = useStoreActions(
    (action) => action.sectionPositions.setPositionUpdateRequested
  );
  return () => {
    setPositionUpdateRequested({ sectionId, positionUpdateRequested: true });
    setPositionUpdateRequested({
      sectionId: PANEID,
      positionUpdateRequested: true,
    });
  };
}

export function useGetSectionPosition(sectionId) {
  const getCurrPositionOfSection = useStoreActions(
    (actions) => actions.sectionPositions.getCurrPositionOfSection
  );

  const sectionPositionUpdated = useStoreState(
    (actions) => actions.sectionPositions.positionUpdated[sectionId]
  );

  const panePositionUpdated = useStoreState(
    (actions) => actions.sectionPositions.positionUpdated[PANEID]
  );

  const setPositionUpdated = useStoreActions(
    (actions) => actions.sectionPositions.setPositionUpdated
  );

  const [coords, setCoords] = useState({});

  useEffect(() => {
    if (sectionPositionUpdated && panePositionUpdated) {
      const { y, x } = getCurrPositionOfSection(sectionId);
      setCoords({ y: -y, x: -x });
    }
    setPositionUpdated({ sectionId, positionUpdated: false });
  }, [sectionPositionUpdated]);

  return coords;
}

export function useSetGoToCoordinates(sectionId) {
  const setGoToCoordinates = useStoreActions(
    (actions) => actions.mapInteraction.setGoToCoordinates
  );

  const coords = useGetSectionPosition(sectionId);

  useEffect(() => {
    if (!_.isEmpty(coords)) {
      setGoToCoordinates(coords);
    }
  }, [coords]);
}
