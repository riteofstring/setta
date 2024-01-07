import _ from "lodash";
import { temporal } from "zundo";
import { createProjectState } from "./utils";

type ActiveSectionStateType = { id: string | null; version: 0 };
type ActiveSectionActionType = { setId: (payload: string | null) => void };

type ActiveSectionZustandType = ActiveSectionStateType &
  ActiveSectionActionType;

export const useActiveSection = createProjectState(
  temporal<ActiveSectionZustandType>((set) => ({
    ids: [],
    version: 0,
    setIds: (payload) => set({ ids: payload }),
    addIds: (payload) =>
      set((state) => ({ ids: [...new Set([...state.ids, ...payload])] })),
    removeIds: (payload) =>
      set((state) => ({ ids: _.difference(state.ids, payload) })),
    clear: () => set({ ids: [] }),
  }))
);

useActiveSection.temporal.getState().pause();
