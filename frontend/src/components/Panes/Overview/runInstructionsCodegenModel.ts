import {
  CodeObjTypeEnum,
  CodeObjValueRepresentationModeEnum,
  SectionTypeEnum,
  type CodeObjType,
  type CodeObjValueRepresentationMode,
  type PluginStatusEntry,
  type SectionType,
  type SettingsState,
} from "utils/generatedTypes";

export type RunSnapshotMode = SettingsState["backend"]["runSnapshotMode"];
export type RunSnapshotModeChoice = RunSnapshotMode | "default";
export type SectionCodegenMode = "inherit" | "include" | "exclude";
export type SectionRepresentationMode =
  | "expression"
  | "file_path"
  | "file_read";
export type SectionOption = { id: string; name: string; type: SectionType };
export type CodeObjOption = {
  id: string;
  name: string;
  type: CodeObjType;
  sectionName: string;
  label: string;
};
export type PluginCodegenRegistration = {
  targetId: string;
  language: string;
  name: string;
};

type MetaControlCodeObjType = (typeof META_CONTROL_CODE_OBJ_TYPES)[number];

export const CODEGEN_SECTION_TYPES: SectionType[] = [
  SectionTypeEnum.Callable,
  SectionTypeEnum.Dict,
  SectionTypeEnum.ListRoot,
  SectionTypeEnum.Group,
  SectionTypeEnum.GlobalVariables,
  SectionTypeEnum.TextBlock,
  SectionTypeEnum.Draw,
  SectionTypeEnum.Image,
  SectionTypeEnum.MetaControl,
  SectionTypeEnum.Chat,
];

export const META_CONTROL_CODE_OBJ_TYPES: CodeObjType[] = [
  CodeObjTypeEnum.DropdownParam,
  CodeObjTypeEnum.SliderParam,
  CodeObjTypeEnum.RotaryParam,
  CodeObjTypeEnum.SwitchParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.DateParam,
  CodeObjTypeEnum.TimeParam,
  CodeObjTypeEnum.TextAreaParam,
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.PasswordParam,
  CodeObjTypeEnum.ColorPickerParam,
  CodeObjTypeEnum.ButtonParam,
  CodeObjTypeEnum.DropzoneParam,
];

export const META_CONTROL_CODE_OBJ_LABELS: Record<
  MetaControlCodeObjType,
  string
> = {
  [CodeObjTypeEnum.DropdownParam]: "Dropdown",
  [CodeObjTypeEnum.SliderParam]: "Slider",
  [CodeObjTypeEnum.RotaryParam]: "Rotary",
  [CodeObjTypeEnum.SwitchParam]: "Switch",
  [CodeObjTypeEnum.TextParam]: "Text Input",
  [CodeObjTypeEnum.DateParam]: "Date Input",
  [CodeObjTypeEnum.TimeParam]: "Time Input",
  [CodeObjTypeEnum.TextAreaParam]: "Text Area",
  [CodeObjTypeEnum.CodeParam]: "Code Input",
  [CodeObjTypeEnum.PasswordParam]: "Password Field",
  [CodeObjTypeEnum.ColorPickerParam]: "Color Picker",
  [CodeObjTypeEnum.ButtonParam]: "Button",
  [CodeObjTypeEnum.DropzoneParam]: "Dropzone",
};

export const CODEGEN_CODE_OBJ_TYPES: CodeObjType[] = [
  CodeObjTypeEnum.CodeParam,
  CodeObjTypeEnum.TextParam,
  CodeObjTypeEnum.DateParam,
  CodeObjTypeEnum.TimeParam,
  CodeObjTypeEnum.ButtonParam,
  CodeObjTypeEnum.SliderParam,
  CodeObjTypeEnum.RotaryParam,
  CodeObjTypeEnum.SwitchParam,
  CodeObjTypeEnum.ColorPickerParam,
  CodeObjTypeEnum.DropdownParam,
  CodeObjTypeEnum.PasswordParam,
  CodeObjTypeEnum.TextAreaParam,
  CodeObjTypeEnum.DropzoneParam,
  CodeObjTypeEnum.NestedParam,
];

export const SECTION_CODEGEN_MODE_OPTIONS: Array<{
  value: SectionCodegenMode;
  label: string;
}> = [
  { value: "inherit", label: "inherit" },
  { value: "include", label: "include" },
  { value: "exclude", label: "exclude" },
];

export const RUN_SNAPSHOT_MODE_OPTIONS: Array<{
  value: RunSnapshotMode;
  label: string;
  description: string;
}> = [
  {
    value: "ephemeral",
    label: "Ephemeral",
    description: "Snapshot per run, cleaned up automatically.",
  },
  {
    value: "always",
    label: "Always",
    description: "Snapshot per run, stored under code history.",
  },
  {
    value: "never",
    label: "Never",
    description: "Run from canonical files without a snapshot.",
  },
];

export const RUN_SNAPSHOT_MODE_CHOICES: Array<{
  value: RunSnapshotModeChoice;
  label: string;
  description: string;
}> = [
  {
    value: "default",
    label: "Use Settings",
    description: "Follow the settings default for this project.",
  },
  ...RUN_SNAPSHOT_MODE_OPTIONS,
];

export function collectPluginCodegenRegistrations(
  pluginStatusEntries: PluginStatusEntry[],
): PluginCodegenRegistration[] {
  const registrationsById = new Map<string, PluginCodegenRegistration>();
  for (const pluginStatusEntry of pluginStatusEntries) {
    for (const registration of pluginStatusEntry.registeredCodegenTargets) {
      if (registrationsById.has(registration.targetId)) {
        continue;
      }
      registrationsById.set(registration.targetId, {
        targetId: registration.targetId,
        language: registration.language,
        name: registration.name,
      });
    }
  }
  return [...registrationsById.values()].sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) {
      return byName;
    }
    const byLanguage = a.language.localeCompare(b.language);
    if (byLanguage !== 0) {
      return byLanguage;
    }
    return a.targetId.localeCompare(b.targetId);
  });
}

export function getRepresentationOptions(
  sectionType: SectionType | null,
): SectionRepresentationMode[] {
  if (sectionType === SectionTypeEnum.Chat) {
    return ["expression", "file_path", "file_read"];
  }
  if (
    sectionType === SectionTypeEnum.Draw ||
    sectionType === SectionTypeEnum.Image
  ) {
    return ["file_path", "file_read"];
  }
  if (sectionType === SectionTypeEnum.Chart) {
    return ["expression", "file_path"];
  }
  return ["expression"];
}

export function getCodeObjRepresentationOptions(
  codeObjType: CodeObjType | null,
): CodeObjValueRepresentationMode[] {
  if (!codeObjType) {
    return [CodeObjValueRepresentationModeEnum.expression];
  }
  if (codeObjType === CodeObjTypeEnum.DropzoneParam) {
    return [
      CodeObjValueRepresentationModeEnum.file_path,
      CodeObjValueRepresentationModeEnum.file_read,
    ];
  }
  if (
    codeObjType === CodeObjTypeEnum.ButtonParam ||
    codeObjType === CodeObjTypeEnum.CodeCallable ||
    codeObjType === CodeObjTypeEnum.NestedParam
  ) {
    return [CodeObjValueRepresentationModeEnum.expression];
  }
  if (
    codeObjType === CodeObjTypeEnum.TextParam ||
    codeObjType === CodeObjTypeEnum.DateParam ||
    codeObjType === CodeObjTypeEnum.TimeParam ||
    codeObjType === CodeObjTypeEnum.TextAreaParam ||
    codeObjType === CodeObjTypeEnum.PasswordParam ||
    codeObjType === CodeObjTypeEnum.ColorPickerParam
  ) {
    return [CodeObjValueRepresentationModeEnum.string];
  }
  if (
    codeObjType === CodeObjTypeEnum.CodeParam ||
    codeObjType === CodeObjTypeEnum.RotaryParam ||
    codeObjType === CodeObjTypeEnum.SwitchParam ||
    codeObjType === CodeObjTypeEnum.DropdownParam
  ) {
    return [
      CodeObjValueRepresentationModeEnum.expression,
      CodeObjValueRepresentationModeEnum.string,
    ];
  }
  if (codeObjType === CodeObjTypeEnum.SliderParam) {
    return [
      CodeObjValueRepresentationModeEnum.expression,
      CodeObjValueRepresentationModeEnum.json_parsed,
      CodeObjValueRepresentationModeEnum.string,
    ];
  }
  return [CodeObjValueRepresentationModeEnum.expression];
}
