import { setOneUITypeConfig } from "../uiTypes";

export function setConfigAndChildConfig(uiType, configProps) {
  setOneUITypeConfig({ uiTypeId: uiType.id, ...configProps });

  const childUITypeId = uiType.config.childUITypeId;
  // Changing a root config should also change its child config
  if (childUITypeId) {
    setOneUITypeConfig({ uiTypeId: childUITypeId, ...configProps });
  }
}
