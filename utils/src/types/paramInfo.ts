import { ManyEVColType } from "./evCol";
import { UITypeType } from "./uiType";
import { ManyUITypeColType, UITypeColType } from "./uiTypeCol";
import { ManyOf } from "./utils";

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

  initManyEnteredValues: (payload: {
    collectionId: string;
    paramIdsToUITypes: ManyOf<UITypeType>;
  }) => void;

  setEnteredValue: (payload: {
    collectionId: string;
    paramInfoId: string;
    value: string;
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

  setNonPresetUITypeIds: (payload: {
    collectionId: string;
    paramInfoId: string;
    newValueFn: (curr: string[]) => string[];
  }) => void;

  deleteParamInfo: (payload: {
    evColId: string;
    uiTypeColId: string;
    ids: string[];
  }) => void;
};

export type ParamInfoZustandType = ParamInfoStateType & ParamInfoActionType;
