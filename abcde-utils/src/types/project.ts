export type ProjectAddressType = {
  username: string;
  projectName: string;
  configName: string;
};

export type ProjectType = {
  id: string;
  name: string;
};

export type ProjectActionType = {
  resetAndSetAll: (payload: ProjectType) => void;

  setAll: (payload: ProjectType) => void;

  setName: (payload: string) => void;

  reset: () => void;

  getAll: () => ProjectType;
};

export type ProjectZustandType = ProjectType & ProjectActionType;
