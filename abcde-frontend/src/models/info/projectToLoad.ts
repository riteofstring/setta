import { NO_AUTH } from "utils/constants";
import { create } from "../utils";

type ProjectToLoadStateType = {
  id: string | null;
  configId: string | null;
  isLoading: boolean | null;
};

type ProjectToLoadActionType = {
  setProject: (payload: { id: string | null; configId: string | null }) => void;
  setIsLoading: (payload: boolean | null) => void;
};

type ProjectToLoadZustandType = ProjectToLoadStateType &
  ProjectToLoadActionType;

export const useProjectToLoad = create<ProjectToLoadZustandType>((set) => ({
  id: NO_AUTH ? "61e089c8-62bf-4e8c-915e-111b4587da81" : null,
  configId: NO_AUTH ? "439f5590-fa98-4564-8f63-ec75b6dc89b2" : null,
  isLoading: null,
  setProject: ({ id, configId }) => set(() => ({ id, configId })),
  setIsLoading: (payload) => set(() => ({ isLoading: payload })),
}));
