import { ManyEVColType } from "./evCol";
import { ManyUITypeColType, UITypeColType } from "./uiTypeCol";

export type ParamInfoStateType = {
  x: ManyEVColType;
  y: ManyUITypeColType;
  version: number;
};

export type ParamInfoActionType = {
  resetAndSetAll: (payload: {
    evCols: ManyEVColType;
    uiTypeCols: ManyUITypeColType;
  }) => void;

  initManyEvColIds: (payload: { collectionIds: string[] }) => void;

  setManyEnteredValueIds: (payload: {
    collectionId: string;
    paramIdToEvId: { [id: string]: string };
  }) => void;

  setEnteredValueId: (payload: {
    collectionId: string;
    paramInfoId: string;
    enteredValueId: string;
  }) => void;

  initManyUITypeColIds: (payload: { collectionIds: string[] }) => void;

  setManyUITypeIds: (payload: {
    collectionId: string;
    paramIdToUITypeId: UITypeColType;
  }) => void;

  setUITypeId: (payload: {
    collectionId: string;
    paramInfoId: string;
    uiTypeId: string;
  }) => void;

  deleteParamInfo: (payload: {
    evColId: string;
    uiTypeColId: string;
    ids: string[];
  }) => void;
};

export type ParamInfoZustandType = ParamInfoStateType & ParamInfoActionType;
