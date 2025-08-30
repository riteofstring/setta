import { ObjectValues } from "utils/generatedTypes";

export const ModalTypeEnum = {
  DELETE_PROJECT_WARNING: "DELETE_PROJECT_WARNING",
} as const;

export type ModalType = ObjectValues<typeof ModalTypeEnum>;

export type ModalDataMap = {
  [ModalTypeEnum.DELETE_PROJECT_WARNING]: {
    selectedProjectsIdName: Array<{ id: string; name: string }>;
    setSelectedProjects: (x: Array<string>) => void;
  };
};

// Then generate the union type from the map
export type ModalInfoType = {
  [K in keyof ModalDataMap]: {
    type: K;
    data: ModalDataMap[K];
  };
}[keyof ModalDataMap];
