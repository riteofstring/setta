export type ProjectType = {
  id: string;
  name: string;
  defaultConfigId: string;
};

export type ProjectActionType = {
  resetAndSetAll: (payload: ProjectType) => void;

  setAll: (payload: ProjectType) => void;

  reset: () => void;

  getAll: () => ProjectType;
};

export type ProjectZustandType = ProjectType & ProjectActionType;
