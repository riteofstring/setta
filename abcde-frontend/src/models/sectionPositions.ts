import { SectionPositionType } from "abcde-utils/src/types/sectionPosition";
import { immer } from "zustand/middleware/immer";
import { create } from "./utils";

type SectionPositionsStateType = {
  sectionPositions: { [id: string]: SectionPositionType };
  positionUpdateRequested: { [id: string]: boolean };
  positionUpdated: { [id: string]: boolean };
  whoRequested: string | null;
};

type SectionPositionsActionType = {
  setSectionPosition: (payload: {
    sectionId: string;
    x: number;
    y: number;
  }) => void;

  setPositionUpdateRequested: (payload: {
    sectionIds: string[];
    positionUpdateRequested: boolean;
  }) => void;

  setPositionUpdated: (payload: {
    sectionIds: string[];
    positionUpdated: boolean;
  }) => void;

  setWhoRequested: (payload: string | null) => void;
};

type SectionPositionsZustandType = SectionPositionsStateType &
  SectionPositionsActionType;

export const useSectionPositions = create(
  immer<SectionPositionsZustandType>((set) => ({
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
  }))
);
