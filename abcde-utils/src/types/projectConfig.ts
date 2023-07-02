export type ProjectConfigType = {
  id: string;
  name: string;
  sectionConfigCol: string;
  childrenId: string;
  children: string[];
  isDefault: boolean;
  version: number;
};

export type ProjectConfigActionType = {
  resetAndSetAll: (payload: ProjectConfigType) => void;

  addChildren: (payload: string[]) => void;

  deleteChildren: (payload: string[]) => void;

  getAll: () => ProjectConfigType;
};

export type ProjectConfigZustandType = ProjectConfigType &
  ProjectConfigActionType;
