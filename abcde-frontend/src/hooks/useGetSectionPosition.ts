import _ from "lodash";
import { usePanes } from "models/panes";
import { useSectionPositions } from "models/sectionPositions";
import { useReactFlow, useStoreApi } from "react-flow-renderer";
import useDeepCompareEffect from "use-deep-compare-effect";
import { OVERVIEW, PANEID } from "utils/constants";

export function useGoToSection(sectionId, requesterName) {
  const requestPositionUpdate = useRequestSectionPositionUpdate();
  useSetGoToCoordinates(sectionId, requesterName);
  return () => requestPositionUpdate([sectionId], requesterName);
}

export function useRequestSectionPositionUpdate() {
  const setWhoRequested = useSectionPositions((x) => x.setWhoRequested);

  const setPositionUpdateRequested = useSectionPositions(
    (x) => x.setPositionUpdateRequested
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
  const whoRequested = useSectionPositions((x) => x.whoRequested);
  const setWhoRequested = useSectionPositions((x) => x.setWhoRequested);

  const getCurrPositionOfSection = useSectionPositions(
    (x) => x.getCurrPositionOfSection
  );

  const sectionPositionUpdated = useSectionPositions(
    (x) => (allIds ? allIds.map((y) => x.positionUpdated[y]) : [false]), //don't return empty array because _.every will evaluate to true
    _.isEqual
  );

  const setPositionUpdated = useSectionPositions((x) => x.setPositionUpdated);

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
  const store = useStoreApi(); // height and width of the react flow container
  const overviewWidth = usePanes((x) => x.trueWidth[OVERVIEW]);
  const margin = 20;

  function onCoordsReceived(coords) {
    const { width, height } = store.getState();
    const { x, y } = project(coords[sectionId]);
    const newX = x + width / 2 - overviewWidth - margin;
    const newY = y + height / 2 - margin;
    setCenter(newX, newY, {
      zoom: 1,
      duration: 25,
    });
  }

  useGetSectionPosition([sectionId], requesterName, onCoordsReceived);
}
