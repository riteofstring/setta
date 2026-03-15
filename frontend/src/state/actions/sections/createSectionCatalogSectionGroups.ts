import { CodeLanguageEnum, SectionTypeEnum } from "utils/generatedTypes";

import type { CreateSectionsContextMenuInfo } from "./createSectionCatalogTypes";

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
