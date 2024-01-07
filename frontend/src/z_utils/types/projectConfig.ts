import { SectionPositionType } from "./sectionPosition";
import { ManyOf } from "./utils";

export type ProjectConfigType = {
  id: string;
  name: string;
};

export type ProjectConfigFrontendType = ProjectConfigType & {
  version: number;
};

export type ProjectConfigActionType = {
  resetAndSetAll: (payload: ProjectConfigType) => void;

  updatePositions: (payload: ManyOf<Partial<SectionPositionType>>) => void;

  setName: (payload: string) => void;

  getAll: () => ProjectConfigType;
};

export type ProjectConfigZustandType = ProjectConfigFrontendType &
  ProjectConfigActionType;
