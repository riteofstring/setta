import _ from "lodash";
import { useSectionPositions } from "models/sectionPositions";
import { PANEID } from "utils/constants";

function relativePos(sectionPositions, sectionId) {
  const sectionP = sectionPositions[sectionId];
  const paneP = sectionPositions[PANEID];
  return { y: sectionP.y - paneP.y, x: sectionP.x - paneP.x };
}

export function getCurrPositionOfSection(sectionIds: string[]) {
  const state = useSectionPositions.getState();
  return _.fromPairs(
    sectionIds.map((x) => [x, relativePos(state.sectionPositions, x)])
  );
}
