import { CodeObjTypeEnum, type CodeObjType } from "utils/generatedTypes";

export type MetaControlRendererFamily =
  | "button"
  | "text-input"
  | "date-time"
  | "slider"
  | "rotary"
  | "switch"
  | "color-picker"
  | "dropdown"
  | "password"
  | "dropzone";

export const META_CONTROL_TEXT_INPUT_CODE_OBJ_TYPES = [
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.TextAreaParam,
] as const satisfies readonly CodeObjType[];

const META_CONTROL_DATE_TIME_CODE_OBJ_TYPES = [
  CodeObjTypeEnum.DateParam,
  CodeObjTypeEnum.TimeParam,
] as const satisfies readonly CodeObjType[];

export const META_CONTROL_DIRECT_VALUE_RENDERER_FAMILIES = {
  [CodeObjTypeEnum.SliderParam]: "slider",
  [CodeObjTypeEnum.RotaryParam]: "rotary",
  [CodeObjTypeEnum.SwitchParam]: "switch",
  [CodeObjTypeEnum.ColorPickerParam]: "color-picker",
  [CodeObjTypeEnum.DropdownParam]: "dropdown",
  [CodeObjTypeEnum.PasswordParam]: "password",
  [CodeObjTypeEnum.DropzoneParam]: "dropzone",
} satisfies Partial<Record<CodeObjType, MetaControlRendererFamily>>;

export function getMetaControlContentCodeObjTypes(): readonly CodeObjType[] {
  return [
    CodeObjTypeEnum.ButtonParam,
    ...META_CONTROL_TEXT_INPUT_CODE_OBJ_TYPES,
    ...META_CONTROL_DATE_TIME_CODE_OBJ_TYPES,
    ...(Object.keys(
      META_CONTROL_DIRECT_VALUE_RENDERER_FAMILIES,
    ) as CodeObjType[]),
  ];
}

export function getMetaControlContentRenderFamily(
  codeObjType: CodeObjType,
): MetaControlRendererFamily | null {
  if (codeObjType === CodeObjTypeEnum.ButtonParam) {
    return "button";
  }
  if (
    (META_CONTROL_TEXT_INPUT_CODE_OBJ_TYPES as readonly CodeObjType[]).includes(
      codeObjType,
    )
  ) {
    return "text-input";
  }
  if (
    (META_CONTROL_DATE_TIME_CODE_OBJ_TYPES as readonly CodeObjType[]).includes(
      codeObjType,
    )
  ) {
    return "date-time";
  }
  return META_CONTROL_DIRECT_VALUE_RENDERER_FAMILIES[codeObjType] ?? null;
}
