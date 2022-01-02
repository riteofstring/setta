import { useStoreActions, useStoreState } from "easy-peasy";
import { useEffect, useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { PANEID } from "utils/constants";

export function useRequestSectionPositionUpdate(
  sectionId,
  requesterName,
  sectionIds = null
) {
  const setWhoRequested = useStoreActions(
    (x) => x.sectionPositions.setWhoRequested
  );

  const setPositionUpdateRequested = useStoreActions(
    (x) => x.sectionPositions.setPositionUpdateRequested
  );
  return () => {
    setWhoRequested(requesterName);
    setPositionUpdateRequested({
      sectionId,
      sectionIds,
      positionUpdateRequested: true,
    });
    setPositionUpdateRequested({
      sectionId: PANEID,
      positionUpdateRequested: true,
    });
  };
}

export function useGetSectionPosition(sectionId, requesterName, absolute) {
  const whoRequested = useStoreState((x) => x.sectionPositions.whoRequested);

  const getCurrPositionOfSection = useStoreActions(
    (x) => x.sectionPositions.getCurrPositionOfSection
  );

  const sectionPositionUpdated = useStoreState(
    (x) => x.sectionPositions.positionUpdated[sectionId]
  );

  const panePositionUpdated = useStoreState(
    (x) => x.sectionPositions.positionUpdated[PANEID]
  );

  const setPositionUpdated = useStoreActions(
    (x) => x.sectionPositions.setPositionUpdated
  );

  const [coords, setCoords] = useState({});

  useEffect(() => {
    if (
      whoRequested === requesterName &&
      sectionPositionUpdated &&
      panePositionUpdated
    ) {
      const { y, x } = getCurrPositionOfSection({ sectionId, absolute });
      setCoords({ y: -y, x: -x });
      setPositionUpdated({ sectionId, positionUpdated: false });
    }
  }, [sectionPositionUpdated]);

  return coords;
}

export function useSetGoToCoordinates(sectionId, requesterName) {
  const whoRequested = useStoreState((x) => x.sectionPositions.whoRequested);
  const setWhoRequested = useStoreActions(
    (x) => x.sectionPositions.setWhoRequested
  );

  const setGoToCoordinates = useStoreActions(
    (x) => x.mapInteraction.setGoToCoordinates
  );

  const coords = useGetSectionPosition(sectionId, requesterName);

  useEffect(() => {
    if (whoRequested === requesterName && !_.isEmpty(coords)) {
      setWhoRequested(null);
      setGoToCoordinates(coords);
    }
  }, [coords]);
}

export function useRequestGroupPositionUpdate(groupId, requesterName) {
  const sectionIds = useStoreState((x) => x.master.groupChildren[groupId]);
  return useRequestSectionPositionUpdate(null, requesterName, sectionIds);
}

export function useGetGroupPosition(groupId, requesterName, absolute) {
  const whoRequested = useStoreState((x) => x.sectionPositions.whoRequested);

  const sectionIds = useStoreState((x) => x.master.groupChildren[groupId]);
  const getCurrPositionOfSection = useStoreActions(
    (x) => x.sectionPositions.getCurrPositionOfSection
  );

  const sectionPositionUpdated = useStoreState(
    (x) =>
      sectionIds
        ? sectionIds.map((y) => x.sectionPositions.positionUpdated[y])
        : [false], //don't return empty array because _.every will evaluate to true
    _.isEqual
  );

  const panePositionUpdated = useStoreState(
    (x) => x.sectionPositions.positionUpdated[PANEID]
  );

  const setPositionUpdated = useStoreActions(
    (x) => x.sectionPositions.setPositionUpdated
  );

  const [coords, setCoords] = useState([]);

  useDeepCompareEffect(() => {
    if (
      whoRequested === requesterName &&
      _.every(sectionPositionUpdated) &&
      panePositionUpdated
    ) {
      const allCoords = getCurrPositionOfSection({ sectionIds, absolute });
      setCoords(allCoords);
      setPositionUpdated({ sectionIds, positionUpdated: false });
    }
  }, [sectionPositionUpdated]);

  return coords;
}
