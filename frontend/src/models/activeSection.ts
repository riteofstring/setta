import { temporal } from "zundo";
import { createProjectState } from "./utils";

type ActiveSectionStateType = { id: string | null; version: 0 };
type ActiveSectionActionType = { setId: (payload: string | null) => void };

type ActiveSectionZustandType = ActiveSectionStateType &
  ActiveSectionActionType;

export const useActiveSection = createProjectState(
  temporal<ActiveSectionZustandType>((set) => ({
    id: null,
    version: 0,
    setId: (payload) => set(() => ({ id: payload })),
  }))
);

useActiveSection.temporal.getState().pause();
