import { useUITypes } from "models/info/uiTypes";
import { cloneRootUIType } from "./cloneUITypes";

export function getChildUITypeId(parentUIType, parentId) {
  // If a childUIType was created before, then the parentUIType will have its id
  const { childUITypeId } = parentUIType.config;
  if (childUITypeId) {
    return childUITypeId;
  }

  const uiTypesState = useUITypes.getState();

  // Otherwise, a child ui type needs to be created
  const newUIType = cloneRootUIType(parentUIType, parentId);
  const id = newUIType.id;
  uiTypesState.setOneConfig({
    uiTypeId: parentUIType.id,
    configName: "childUITypeId",
    newValueFn: () => id,
  });
  uiTypesState.setUIType({ uiType: newUIType });
  return id;
}
