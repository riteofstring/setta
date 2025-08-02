import { SectionTypeEnum } from "utils/generatedTypes";

export function getIsRoot(sectionTypeName) {
  return [
    SectionTypeEnum.ListRoot,
    SectionTypeEnum.DictRoot,
    SectionTypeEnum.Group,
  ].includes(sectionTypeName);
}

export const uiTypesToPretty = {
  // [UITypeNameEnum.TEXT]: "Text",
  // [UITypeNameEnum.SLIDER]: "Slider",
  // [UITypeNameEnum.SWITCH]: "Switch",
  // [UITypeNameEnum.COLOR_PICKER]: "Color Picker",
  // [UITypeNameEnum.DROPDOWN]: "Dropdown",
  // [UITypeNameEnum.PASSWORD]: "Password",
  // [UITypeNameEnum.SECTION]: "Object",
  // [UITypeNameEnum.LIST_ROOT]: "List of Objects",
  // [UITypeNameEnum.DICT_ROOT]: "Dict of Objects",
  // [UITypeNameEnum.GROUP]: "Group",
  // [UITypeNameEnum.IMAGE]: "Image",
  // [UITypeNameEnum.CHART]: "Chart",
  // [UITypeNameEnum.DRAW]: "Drawing Area",
  // [UITypeNameEnum.TEXT_BLOCK]: "Text Block",
  // [UITypeNameEnum.SOCIAL]: "Social",
  // [UITypeNameEnum.GLOBAL_VARIABLES]: "Global Variables",
  // [UITypeNameEnum.CODE]: "Code",
  // [UITypeNameEnum.TERMINAL]: "Terminal",
};
