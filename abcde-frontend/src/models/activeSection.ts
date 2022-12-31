import { create } from "./utils";

type ActiveSectionStateType = { id: string | null };
type ActiveSectionActionType = { setId: (payload: string | null) => void };

type ActiveSectionZustandType = ActiveSectionStateType &
  ActiveSectionActionType;

export const useActiveSection = create<ActiveSectionZustandType>((set) => ({
  id: null,
  setId: (payload) => set(() => ({ id: payload })),
}));
