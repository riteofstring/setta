import { ManyEVColType } from "./evCol";
import { ManyUITypeColType } from "./uiTypeCol";

export type ParamInfoStateType = {
  x: ManyEVColType;
  y: ManyUITypeColType;
};

export type ParamInfoStateActionType = {
  resetAndSetAll: (payload: {
    evCols: ManyEVColType;
    uiTypeCols: ManyUITypeColType;
  }) => void;

  setUITypeId: (payload: {
    collectionId: string;
    paramInfoId: string;
    uiTypeId: string;
  }) => void;

  setEnteredValueId: (payload: {
    collectionId: string;
    paramInfoId: string;
    enteredValueId: string;
  }) => void;

  deleteParamInfo: (payload: {
    evColId: string;
    uiTypeColId: string;
    ids: string[];
  }) => void;

  setAll: (payload: ParamInfoStateType) => void;

  reset: () => void;
};

export type ParamInfoZustandType = ParamInfoStateType &
  ParamInfoStateActionType;
