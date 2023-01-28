export type ProjectConfigType = {
  id: string;
  name: string;
  sectionConfigCol: string;
  childrenId: string;
  children: string[];
  isDefault: boolean;
};

export type ProjectConfigActionType = {
  resetAndSetAll: (payload: ProjectConfigType) => void;

  addChildren: (payload: string[]) => void;

  deleteChildren: (payload: string[]) => void;

  setAll: (payload: ProjectConfigType) => void;

  reset: () => void;

  getAll: () => ProjectConfigType;
};

export type ProjectConfigZustandType = ProjectConfigType &
  ProjectConfigActionType;
