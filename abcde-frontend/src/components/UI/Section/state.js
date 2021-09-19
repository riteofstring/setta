import { PANEID } from "../../../utils/constants";
import { atomFamily } from "jotai/utils";
import { atom } from "jotai";
import deepEqual from "fast-deep-equal";

export const sectionPosition = atomFamily((sectionId) => atom({ y: 0, x: 0 }));
export const positionUpdateRequested = atomFamily((sectionId) => atom(false));
export const positionUpdated = atomFamily((sectionId) => atom(false));

export const relativeSectionPosition = atomFamily((id) =>
  atom((get) => {
    const sectionP = get(sectionPosition(id));
    const paneP = get(sectionPosition(PANEID));
    return { y: sectionP.y - paneP.y, x: sectionP.x - paneP.x };
  })
);

export const enteredValues = atomFamily(
  ({ sectionId, selected, paramName }) => atom(null),
  deepEqual
);
