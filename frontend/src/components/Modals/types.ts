import { ObjectValues } from "utils/generatedTypes";

export const ModalTypeEnum = {
  DELETE_PROJECT_WARNING: "DELETE_PROJECT_WARNING",
  DELETE_JSON_SOURCE_FILE: "DELETE_JSON_SOURCE_FILE",
} as const;

export type ModalType = ObjectValues<typeof ModalTypeEnum>;

export type ModalDataMap = {
  [ModalTypeEnum.DELETE_PROJECT_WARNING]: {
    selectedProjectsIdName: Array<{ id: string; name: string }>;
    setSelectedProjects: (x: Array<string>) => void;
  };
  [ModalTypeEnum.DELETE_JSON_SOURCE_FILE]: {
    sectionId: string;
    variantId: string;
    filepath: string;
  };
};

// Then generate the union type from the map
export type ModalInfoType = {
  [K in keyof ModalDataMap]: {
    type: K;
    data: ModalDataMap[K];
  };
}[keyof ModalDataMap];
