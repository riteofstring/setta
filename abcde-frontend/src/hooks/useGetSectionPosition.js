import { useStoreActions, useStoreState } from "easy-peasy";
import { useReactFlow } from "react-flow-renderer";
import useDeepCompareEffect from "use-deep-compare-effect";
import { PANEID } from "utils/constants";

export function useGoToSection(sectionId, requesterName) {
  const requestPositionUpdate = useRequestSectionPositionUpdate();
  useSetGoToCoordinates(sectionId, requesterName);
  return () => requestPositionUpdate([sectionId], requesterName);
}

export function useRequestSectionPositionUpdate() {
  const setWhoRequested = useStoreActions(
    (x) => x.sectionPositions.setWhoRequested
  );

  const setPositionUpdateRequested = useStoreActions(
    (x) => x.sectionPositions.setPositionUpdateRequested
  );
  return (sectionIds, requesterName) => {
    setWhoRequested(requesterName);
    setPositionUpdateRequested({
      sectionIds: [...sectionIds, PANEID],
      positionUpdateRequested: true,
    });
  };
}

export function useGetSectionPosition(
  sectionIds,
  requesterName,
  onCoordsReceived
) {
  const allIds = sectionIds ? [...sectionIds, PANEID] : null;
  const whoRequested = useStoreState((x) => x.sectionPositions.whoRequested);
  const setWhoRequested = useStoreActions(
    (x) => x.sectionPositions.setWhoRequested
  );

  const getCurrPositionOfSection = useStoreActions(
    (x) => x.sectionPositions.getCurrPositionOfSection
  );

  const sectionPositionUpdated = useStoreState(
    (x) =>
      allIds
        ? allIds.map((y) => x.sectionPositions.positionUpdated[y])
        : [false], //don't return empty array because _.every will evaluate to true
    _.isEqual
  );

  const setPositionUpdated = useStoreActions(
    (x) => x.sectionPositions.setPositionUpdated
  );

  useDeepCompareEffect(() => {
    if (whoRequested === requesterName && _.every(sectionPositionUpdated)) {
      const allCoords = getCurrPositionOfSection({ sectionIds });
      onCoordsReceived(allCoords);
      setPositionUpdated({ sectionIds, positionUpdated: false });
      setWhoRequested(null);
    }
  }, [sectionPositionUpdated]);
}

function useSetGoToCoordinates(sectionId, requesterName) {
  const { project, setCenter } = useReactFlow();
  function onCoordsReceived(coords) {
    const { x, y } = project(coords[sectionId]);
    setCenter(x, y, { zoom: 1, duration: 25 });
  }

  useGetSectionPosition([sectionId], requesterName, onCoordsReceived);
}
