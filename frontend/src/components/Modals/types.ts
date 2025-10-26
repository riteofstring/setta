import { ObjectValues } from "utils/generatedTypes";

export const ModalTypeEnum = {
  DELETE_PROJECT_WARNING: "DELETE_PROJECT_WARNING",
  DELETE_JSON_SOURCE_FILE: "DELETE_JSON_SOURCE_FILE",
  FILE_MENU_LOAD_PROJECT_CONFIG: "FILE_MENU_LOAD_PROJECT_CONFIG",
  FILE_MENU_SAVE_PROJECT_CONFIG_AS: "FILE_MENU_SAVE_PROJECT_CONFIG_AS",
  RENAME_REFERENCES: "RENAME_REFERENCES",
} as const;

export type ModalType = ObjectValues<typeof ModalTypeEnum>;

export type RenameReferenceChangedValue = {
  sectionId: string;
  paramInfoId: string | null;
  value: string;
};

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
  [ModalTypeEnum.FILE_MENU_LOAD_PROJECT_CONFIG]: null;
  [ModalTypeEnum.FILE_MENU_SAVE_PROJECT_CONFIG_AS]: { saveWithRefs: boolean };
  [ModalTypeEnum.RENAME_REFERENCES]: {
    frontendOpId: string;
    projectConfigId: string;
    changedValues: Array<RenameReferenceChangedValue>;
  };
};

// Then generate the union type from the map
export type ModalInfoType = {
  [K in keyof ModalDataMap]: {
    type: K;
    data: ModalDataMap[K];
  };
}[keyof ModalDataMap];
