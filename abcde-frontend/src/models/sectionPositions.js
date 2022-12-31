import { PANEID } from "utils/constants";
import { immer } from "zustand/middleware/immer";
import { create } from "./utils";

function relativePos(sectionPositions, sectionId) {
  const sectionP = sectionPositions[sectionId];
  const paneP = sectionPositions[PANEID];
  return { y: sectionP.y - paneP.y, x: sectionP.x - paneP.x };
}

export const useSectionPositions = create(
  immer((set, get) => ({
    sectionPositions: {},
    positionUpdateRequested: {},
    positionUpdated: {},
    whoRequested: null,
    setSectionPosition: ({ sectionId, y, x }) =>
      set((state) => {
        state.sectionPositions[sectionId] = { y, x };
      }),
    setPositionUpdateRequested: ({ sectionIds, positionUpdateRequested }) =>
      set((state) => {
        sectionIds.forEach(
          (x) => (state.positionUpdateRequested[x] = positionUpdateRequested)
        );
      }),
    setPositionUpdated: ({ sectionIds, positionUpdated }) =>
      set((state) => {
        sectionIds.forEach((x) => (state.positionUpdated[x] = positionUpdated));
      }),
    setWhoRequested: (payload) =>
      set((state) => {
        state.whoRequested = payload;
      }),
    getCurrPositionOfSection: ({ sectionIds }) => {
      return Object.assign(
        {},
        ...sectionIds.map((x) => ({
          [x]: relativePos(get().sectionPositions, x),
        }))
      );
    },
  }))
);
