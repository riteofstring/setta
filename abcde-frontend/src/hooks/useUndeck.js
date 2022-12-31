import _ from "lodash";
import { useEffect, useState } from "react";
import { useReactFlow } from "react-flow-renderer";
import { deleteSections, moveSections } from "thunks/sectionOps";
import { PANEID } from "utils/constants";

import {
  useGetSectionPosition,
  useRequestSectionPositionUpdate,
} from "./useGetSectionPosition";
import { useGetAllChildren } from "./useSectionChildren";

function useMakeChildrenTopLevel(deckId, childIds, requesterName) {
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
  }

  useGetSectionPosition(childIds, requesterName, onCoordsReceived);
}

export function useUndeck(sectionId) {
  const [deckId, setDeckId] = useState(null);
  const requesterName = `useUndeck-${deckId}`;
  const childIds = useGetAllChildren(deckId);
  const requestPositionUpdate = useRequestSectionPositionUpdate();
  useMakeChildrenTopLevel(deckId, childIds, requesterName);

  // closeContextMenu() happens before state updates.
  // So sectionId ends up being null by the time onCoordsReceived is called
  // Therefore, only update deckId when sectionId is not null
  useEffect(() => {
    if (sectionId) {
      setDeckId(sectionId);
    }
  }, [sectionId]);

  return () => {
    requestPositionUpdate(childIds, requesterName);
  };
}
