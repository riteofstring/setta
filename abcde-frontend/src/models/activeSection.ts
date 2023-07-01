import { createProjectState } from "./utils";

type ActiveSectionStateType = { id: string | null };
type ActiveSectionActionType = { setId: (payload: string | null) => void };

type ActiveSectionZustandType = ActiveSectionStateType &
  ActiveSectionActionType;

export const useActiveSection = createProjectState<ActiveSectionZustandType>(
  (set) => ({
    id: null,
    setId: (payload) => set(() => ({ id: payload })),
  })
);
