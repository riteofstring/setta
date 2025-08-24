import _ from "lodash";
import { useProjectState } from "state/definitions";
import { CodeLanguageEnum, SectionTypeEnum } from "utils/generatedTypes";
import { PartialImplWithType } from "./createSections";

export type CreateSectionsContextMenuInfo = {
  name: string;
  implSpecs: PartialImplWithType;
};

export function useCreateSectionsList() {
  const singletonSections = useProjectState(
    (x) => x.singletonSections,
    _.isEqual,
  );
  const sectionGroupItems: Array<CreateSectionsContextMenuInfo> = [
    { name: "Callable", implSpecs: { type: SectionTypeEnum.Callable } },
    { name: "Dict", implSpecs: { type: SectionTypeEnum.Dict } },
    {
      name: "List of Objects",
      implSpecs: { type: SectionTypeEnum.ListRoot },
    },
    {
      name: "Dict of Objects",
      implSpecs: { type: SectionTypeEnum.DictRoot },
    },
    { name: "Group", implSpecs: { type: SectionTypeEnum.Group } },
    { name: "Text", implSpecs: { type: SectionTypeEnum.TextBlock } },
  ];

  if (!singletonSections.globalVariables) {
    sectionGroupItems.push({
      name: "Global Variables",
      implSpecs: { type: SectionTypeEnum.GlobalVariables },
    });
  }

  const codeGroupItems: Array<CreateSectionsContextMenuInfo> = [
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
      name: "Terminal",
      implSpecs: { type: SectionTypeEnum.Terminal },
    },
  ];

  if (!singletonSections.genPythonCode) {
    codeGroupItems.push({
      name: "Show Generated Python",
      implSpecs: {
        type: SectionTypeEnum.GenPythonCode,
      },
    });
  }

  const embedGroupItems: Array<CreateSectionsContextMenuInfo> = [
    {
      name: "Social",
      implSpecs: { type: SectionTypeEnum.Social },
    },
    {
      name: "IFrame",
      implSpecs: { type: SectionTypeEnum.IFrame },
    },
  ];

  return [
    {
      group: "Section",
      items: sectionGroupItems,
    },
    {
      group: "Code",
      items: codeGroupItems,
    },
    {
      group: "Artifacts",
      items: [
        {
          name: "Drawing Area",
          specificProps: { type: SectionTypeEnum.Draw },
        },
        { name: "Image", specificProps: { type: SectionTypeEnum.Image } },
        { name: "Chart", specificProps: { type: SectionTypeEnum.Chart } },
        { name: "Chat", specificProps: { type: SectionTypeEnum.Chat } },
        {
          name: "Browser",
          specificProps: { type: SectionTypeEnum.Browser },
        },
      ],
    },
    {
      group: "Embed",
      items: embedGroupItems,
    },
  ];
}
