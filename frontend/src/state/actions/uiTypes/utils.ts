import { UITypeNameSchema, UITypePresetTypeSchema } from "utils/generatedTypes";

export function getIsRoot(sectionTypeName) {
  return [
    UITypeNameSchema.enum.LIST_ROOT,
    UITypeNameSchema.enum.DICT_ROOT,
    UITypeNameSchema.enum.GROUP,
  ].includes(sectionTypeName);
}

export const uiTypesToPretty = {
  [UITypeNameSchema.enum.TEXT]: "Text",
  [UITypeNameSchema.enum.SLIDER]: "Slider",
  [UITypeNameSchema.enum.SWITCH]: "Switch",
  [UITypeNameSchema.enum.COLOR_PICKER]: "Color Picker",
  [UITypeNameSchema.enum.DROPDOWN]: "Dropdown",
  [UITypeNameSchema.enum.PASSWORD]: "Password",
  [UITypeNameSchema.enum.SECTION]: "Object",
  [UITypeNameSchema.enum.LIST_ROOT]: "List of Objects",
  [UITypeNameSchema.enum.DICT_ROOT]: "Dict of Objects",
  [UITypeNameSchema.enum.GROUP]: "Group",
  [UITypeNameSchema.enum.IMAGE]: "Image",
  [UITypeNameSchema.enum.CHART]: "Chart",
  [UITypeNameSchema.enum.DRAW]: "Drawing Area",
  [UITypeNameSchema.enum.TEXT_BLOCK]: "Text Block",
  [UITypeNameSchema.enum.SOCIAL]: "Social",
  [UITypeNameSchema.enum.GLOBAL_VARIABLES]: "Global Variables",
  [UITypeNameSchema.enum.CODE]: "Code",
  [UITypeNameSchema.enum.TERMINAL]: "Terminal",
};

export function isBasePreset(uiType) {
  return uiType.presetType === UITypePresetTypeSchema.enum.BASE;
}

export function isUserPreset(uiType) {
  return uiType.presetType === UITypePresetTypeSchema.enum.USER;
}

export function isPreset(uiType) {
  return isBasePreset(uiType) || isUserPreset(uiType);
}
