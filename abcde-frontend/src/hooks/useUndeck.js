import _ from "lodash";
import { useReactFlow } from "react-flow-renderer";
import { deleteSections, moveSections } from "thunks/sections/sectionOps";
import { PANEID } from "utils/constants";

import {
  useGetSectionPosition,
  useRequestSectionPositionUpdate,
} from "./useGetSectionPosition";
import { useGetAllChildren } from "./useSectionChildren";

function useMakeChildrenTopLevel(
  deckId,
  childIds,
  requesterName,
  doneCallback
) {
  const { project } = useReactFlow();
  function onCoordsReceived(coords) {
    const positions = {};
    _.forEach(coords, function (value, key) {
      positions[key] = { ...project(value) };
    });
    moveSections({
      oldParentId: deckId,
      newParentId: PANEID,
      sectionIds: childIds,
      positions,
    });
    deleteSections({ sectionIds: [deckId] });
    doneCallback();
  }

  useGetSectionPosition(childIds, requesterName, onCoordsReceived);
}

export function useUndeck(deckId, doneCallback = () => undefined) {
  const requesterName = `useUndeck-${deckId}`;
  const childIds = useGetAllChildren(deckId);
  const requestPositionUpdate = useRequestSectionPositionUpdate();
  useMakeChildrenTopLevel(deckId, childIds, requesterName, doneCallback);

  return () => {
    requestPositionUpdate(childIds, requesterName);
  };
}
