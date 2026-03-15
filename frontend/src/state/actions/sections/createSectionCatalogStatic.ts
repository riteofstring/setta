import {
  CodeLanguageEnum,
  CodeObjTypeEnum,
  createSectionSize,
  DateCalendarWeekStartEnum,
  DateControlModeEnum,
  DateSelectionModeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";

import type {
  CreateSectionsContextMenuGroup,
  CreateSectionsContextMenuInfo,
} from "./createSectionCatalogTypes";

export function getBaseSectionGroupItems(): Array<CreateSectionsContextMenuInfo> {
  return [
    { name: "Callable", implSpecs: { type: SectionTypeEnum.Callable } },
    { name: "Param Dict", implSpecs: { type: SectionTypeEnum.Dict } },
    {
      name: "List of Objects",
      implSpecs: { type: SectionTypeEnum.ListRoot },
    },
    { name: "Dict", implSpecs: { type: SectionTypeEnum.Group } },
    { name: "Text", implSpecs: { type: SectionTypeEnum.TextBlock } },
    { name: "Prompt", implSpecs: { type: SectionTypeEnum.Prompt } },
  ];
}

export function getBaseCodeSectionCreateItems(): Array<CreateSectionsContextMenuInfo> {
  return [
    {
      name: "Python Code",
      implSpecs: {
        type: SectionTypeEnum.Code,
        codeLanguage: CodeLanguageEnum.python,
      },
    },
    {
      name: "Bash Script",
      implSpecs: {
        type: SectionTypeEnum.Code,
        codeLanguage: CodeLanguageEnum.bash,
      },
    },
    {
      name: "JSON",
      implSpecs: {
        type: SectionTypeEnum.Code,
        codeLanguage: CodeLanguageEnum.json,
      },
    },
    {
      name: "YAML",
      implSpecs: {
        type: SectionTypeEnum.Code,
        codeLanguage: CodeLanguageEnum.yaml,
      },
    },
    {
      name: "TOML",
      implSpecs: {
        type: SectionTypeEnum.Code,
        codeLanguage: CodeLanguageEnum.toml,
      },
    },
    {
      name: "Terminal",
      implSpecs: { type: SectionTypeEnum.Terminal },
    },
  ];
}

export function getBaseArtifactGroupItems(): Array<CreateSectionsContextMenuInfo> {
  return [
    {
      name: "Drawing Area",
      implSpecs: { type: SectionTypeEnum.Draw },
    },
    { name: "Image", implSpecs: { type: SectionTypeEnum.Image } },
    { name: "Chart", implSpecs: { type: SectionTypeEnum.Chart } },
    { name: "Chat", implSpecs: { type: SectionTypeEnum.Chat } },
    {
      name: "Browser",
      implSpecs: { type: SectionTypeEnum.Browser },
    },
    {
      name: "Spreadsheet",
      implSpecs: { type: SectionTypeEnum.Spreadsheet },
    },
  ];
}

export function getBaseWorkflowGroupItems(): Array<CreateSectionsContextMenuInfo> {
  return [
    {
      name: "State Machine Start",
      implSpecs: { type: SectionTypeEnum.StateMachineStart },
    },
    {
      name: "State Machine Gate",
      implSpecs: { type: SectionTypeEnum.StateMachineGate },
    },
    {
      name: "State Machine End",
      implSpecs: { type: SectionTypeEnum.StateMachineEnd },
    },
  ];
}

export function getBaseOtherGroupItems(): Array<CreateSectionsContextMenuInfo> {
  return [
    { name: "Task Board", implSpecs: { type: SectionTypeEnum.TaskBoard } },
  ];
}

export function getBaseMetaControlGroupItems(): Array<CreateSectionsContextMenuInfo> {
  return [
    {
      name: "Dropdown",
      implSpecs: {
        type: SectionTypeEnum.MetaControl,
      },
      controlCodeObjType: CodeObjTypeEnum.DropdownParam,
    },
    {
      name: "Slider",
      implSpecs: {
        type: SectionTypeEnum.MetaControl,
      },
      controlCodeObjType: CodeObjTypeEnum.SliderParam,
    },
    {
      name: "Rotary",
      implSpecs: {
        type: SectionTypeEnum.MetaControl,
      },
      controlCodeObjType: CodeObjTypeEnum.RotaryParam,
    },
    {
      name: "Switch",
      implSpecs: {
        type: SectionTypeEnum.MetaControl,
      },
      controlCodeObjType: CodeObjTypeEnum.SwitchParam,
    },
    {
      name: "Text Input",
      implSpecs: {
        type: SectionTypeEnum.MetaControl,
      },
      controlCodeObjType: CodeObjTypeEnum.TextParam,
    },
    {
      name: "Calendar",
      implSpecs: {
        type: SectionTypeEnum.MetaControl,
      },
      controlCodeObjType: CodeObjTypeEnum.DateParam,
      controlParamConfig: {
        dateControlMode: DateControlModeEnum.calendar,
        dateSelectionMode: DateSelectionModeEnum.multiple,
        dateCalendarWeekStart: DateCalendarWeekStartEnum.sunday,
      },
    },
    {
      name: "Text Area",
      implSpecs: {
        type: SectionTypeEnum.MetaControl,
      },
      controlCodeObjType: CodeObjTypeEnum.TextAreaParam,
    },
    {
      name: "Password Field",
      implSpecs: {
        type: SectionTypeEnum.MetaControl,
      },
      controlCodeObjType: CodeObjTypeEnum.PasswordParam,
    },
    {
      name: "Color Picker",
      implSpecs: {
        type: SectionTypeEnum.MetaControl,
      },
      controlCodeObjType: CodeObjTypeEnum.ColorPickerParam,
    },
    {
      name: "Button",
      implSpecs: {
        type: SectionTypeEnum.MetaControl,
      },
      controlCodeObjType: CodeObjTypeEnum.ButtonParam,
    },
    {
      name: "Dropzone",
      implSpecs: {
        type: SectionTypeEnum.MetaControl,
        size: createSectionSize({ width: 360, height: 140 }),
      },
      controlCodeObjType: CodeObjTypeEnum.DropzoneParam,
    },
  ];
}

export function getBaseEmbedGroupItems(): Array<CreateSectionsContextMenuInfo> {
  return [
    {
      name: "Social",
      implSpecs: { type: SectionTypeEnum.Social },
    },
    {
      name: "IFrame",
      implSpecs: { type: SectionTypeEnum.IFrame },
    },
  ];
}

export function getBaseCreateSectionGroups(): Array<CreateSectionsContextMenuGroup> {
  return [
    {
      group: "Section",
      items: getBaseSectionGroupItems(),
    },
    {
      group: "Code",
      items: getBaseCodeSectionCreateItems(),
    },
    {
      group: "Artifacts",
      items: getBaseArtifactGroupItems(),
    },
    {
      group: "Workflow",
      items: getBaseWorkflowGroupItems(),
    },
    {
      group: "Other",
      items: getBaseOtherGroupItems(),
    },
    {
      group: "MetaControls",
      items: getBaseMetaControlGroupItems(),
    },
    {
      group: "Embed",
      items: getBaseEmbedGroupItems(),
    },
  ];
}
