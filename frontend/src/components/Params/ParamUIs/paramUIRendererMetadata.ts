import { CodeObjTypeEnum, type CodeObjType } from "utils/generatedTypes";

export type SectionParamUIRendererFamily =
  | "text-like"
  | "date-time"
  | "slider"
  | "rotary"
  | "switch"
  | "color-picker"
  | "dropdown"
  | "password"
  | "dropzone";

export const TEXT_LIKE_PARAM_TYPES = [
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.TextAreaParam,
] as const satisfies readonly CodeObjType[];

const DATE_TIME_PARAM_TYPES = [
  CodeObjTypeEnum.DateParam,
  CodeObjTypeEnum.TimeParam,
] as const satisfies readonly CodeObjType[];

export const SPECIALIZED_PARAM_RENDERER_FAMILIES = {
  [CodeObjTypeEnum.SliderParam]: "slider",
  [CodeObjTypeEnum.RotaryParam]: "rotary",
  [CodeObjTypeEnum.SwitchParam]: "switch",
  [CodeObjTypeEnum.ColorPickerParam]: "color-picker",
  [CodeObjTypeEnum.DropdownParam]: "dropdown",
  [CodeObjTypeEnum.PasswordParam]: "password",
  [CodeObjTypeEnum.DropzoneParam]: "dropzone",
} satisfies Partial<Record<CodeObjType, SectionParamUIRendererFamily>>;

export function getSectionParamUIRendererTypes(): readonly CodeObjType[] {
  return [
    ...TEXT_LIKE_PARAM_TYPES,
    ...DATE_TIME_PARAM_TYPES,
    ...(Object.keys(SPECIALIZED_PARAM_RENDERER_FAMILIES) as CodeObjType[]),
  ];
}

export function getSectionParamUIRendererFamily(
  codeObjType: CodeObjType,
): SectionParamUIRendererFamily | null {
  if ((TEXT_LIKE_PARAM_TYPES as readonly CodeObjType[]).includes(codeObjType)) {
    return "text-like";
  }
  if ((DATE_TIME_PARAM_TYPES as readonly CodeObjType[]).includes(codeObjType)) {
    return "date-time";
  }
  return SPECIALIZED_PARAM_RENDERER_FAMILIES[codeObjType] ?? null;
}
