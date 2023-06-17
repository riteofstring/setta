export type ProjectConfigType = {
  id: string;
  name: string;
  childrenId: string;
  children: string[];
  isDefault: boolean;
};

export type ProjectConfigFrontendType = ProjectConfigType & {
  version: number;
};

export type ProjectConfigActionType = {
  resetAndSetAll: (payload: ProjectConfigType) => void;

  addChildren: (payload: string[]) => void;

  deleteChildren: (payload: string[]) => void;

  getAll: () => ProjectConfigType;
};

export type ProjectConfigZustandType = ProjectConfigFrontendType &
  ProjectConfigActionType;
