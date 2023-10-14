import {
  ManySectionPositionType,
  SectionPositionType,
} from "./sectionPosition";
import { ManyOf } from "./utils";

export type ProjectConfigType = {
  id: string;
  name: string;
  children: ManySectionPositionType;
  viewport: { x: number; y: number; zoom: number };
};

export type ProjectConfigFrontendType = ProjectConfigType & {
  version: number;
};

export type ProjectConfigActionType = {
  resetAndSetAll: (payload: ProjectConfigType) => void;

  addChildren: (payload: ManySectionPositionType) => void;

  deleteChildren: (payload: string[]) => void;

  updatePositions: (payload: ManyOf<Partial<SectionPositionType>>) => void;

  setName: (payload: string) => void;

  setViewport: (payload: ProjectConfigType["viewport"]) => void;

  getAll: () => ProjectConfigType;
};

export type ProjectConfigZustandType = ProjectConfigFrontendType &
  ProjectConfigActionType;
