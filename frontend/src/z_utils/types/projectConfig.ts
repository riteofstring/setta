import { ManySectionPositionType } from "./sectionPosition";

export type ProjectConfigType = {
  id: string;
  name: string;
  children: ManySectionPositionType;
};

export type ProjectConfigFrontendType = ProjectConfigType & {
  version: number;
};

export type ProjectConfigActionType = {
  resetAndSetAll: (payload: ProjectConfigType) => void;

  addChildren: (payload: ManySectionPositionType) => void;

  deleteChildren: (payload: string[]) => void;

  setName: (payload: string) => void;

  getAll: () => ProjectConfigType;
};

export type ProjectConfigZustandType = ProjectConfigFrontendType &
  ProjectConfigActionType;
