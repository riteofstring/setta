import type {
  BaseSectionImplUnion,
  CodeObjTypeEnum,
  DateCalendarWeekStart,
  DateControlMode,
  DateSelectionMode,
} from "utils/generatedTypes";

export type ControlParamConfig = {
  dateControlMode?: DateControlMode;
  dateSelectionMode?: DateSelectionMode;
  dateCalendarWeekStart?: DateCalendarWeekStart;
};

export type CreateSectionsContextMenuInfo = {
  name: string;
  commandId?: string;
  implSpecs: Partial<BaseSectionImplUnion> &
    Required<Pick<BaseSectionImplUnion, "type">>;
  controlCodeObjType?: CodeObjTypeEnum;
  controlParamConfig?: ControlParamConfig;
};

export type CreateSectionsContextMenuGroup = {
  group: string;
  items: Array<CreateSectionsContextMenuInfo>;
};
