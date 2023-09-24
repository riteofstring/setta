import { useUITypes } from "models/info/uiTypes";

export function setConfigAndChildConfig(uiType, configProps) {
  useUITypes.getState().setOneConfig({ uiTypeId: uiType.id, ...configProps });

  const childUITypeId = uiType.config.childUITypeId;
  // Changing a root config should also change its child config
  if (childUITypeId) {
    useUITypes
      .getState()
      .setOneConfig({ uiTypeId: childUITypeId, ...configProps });
  }
}
