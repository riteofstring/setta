import { PANEID } from "../../../utils/constants";
import { atomFamily } from "jotai/utils";
import { atom } from "jotai";

export const sectionPosition = atomFamily((_) => atom({ y: 0, x: 0 }));
export const positionUpdateRequested = atomFamily((_) => atom(false));
export const positionUpdated = atomFamily((_) => atom(false));

export const relativeSectionPosition = atomFamily((id) =>
  atom((get) => {
    const sectionP = get(sectionPosition(id));
    const paneP = get(sectionPosition(PANEID));
    return { y: sectionP.y - paneP.y, x: sectionP.x - paneP.x };
  })
);
