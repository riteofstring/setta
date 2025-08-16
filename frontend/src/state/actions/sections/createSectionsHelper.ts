import _ from "lodash";
import { useProjectState } from "state/definitions";
import { CodeLanguageEnum, SectionTypeEnum } from "utils/generatedTypes";
import { PartialImplWithType } from "./createSections";

export type CreateSectionsContextMenuInfo = {
  name: string;
  specificProps: PartialImplWithType;
};

export function useCreateSectionsList() {
  const singletonSections = useProjectState(
    (x) => x.singletonSections,
    _.isEqual,
  );
  const sectionGroupItems: Array<CreateSectionsContextMenuInfo> = [
    { name: "Callable", specificProps: { type: SectionTypeEnum.Callable } },
    { name: "Dict", specificProps: { type: SectionTypeEnum.Dict } },
    {
      name: "List of Objects",
      specificProps: { type: SectionTypeEnum.ListRoot },
    },
    {
      name: "Dict of Objects",
      specificProps: { type: SectionTypeEnum.DictRoot },
    },
    { name: "Group", specificProps: { type: SectionTypeEnum.Group } },
    { name: "Text", specificProps: { type: SectionTypeEnum.TextBlock } },
  ];

  if (!singletonSections.globalVariables) {
    sectionGroupItems.push({
      name: "Global Variables",
      specificProps: { type: SectionTypeEnum.GlobalVariables },
    });
  }

  const codeGroupItems: Array<CreateSectionsContextMenuInfo> = [
    {
      name: "Python Code",
      specificProps: {
        type: SectionTypeEnum.Code,
        codeLanguage: CodeLanguageEnum.python,
      },
    },
    {
      name: "Bash Script",
      specificProps: {
        type: SectionTypeEnum.Code,
        codeLanguage: CodeLanguageEnum.bash,
      },
    },
    {
      name: "Terminal",
      specificProps: { type: SectionTypeEnum.Terminal },
    },
  ];

  if (!singletonSections.genPythonCode) {
    codeGroupItems.push({
      name: "Show Generated Python",
      specificProps: {
        type: SectionTypeEnum.GenPythonCode,
      },
    });
  }

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
      items: [
        {
          name: "Social",
          specificProps: { type: SectionTypeEnum.Social },
        },
        {
          name: "IFrame",
          specificProps: { type: SectionTypeEnum.IFrame },
        },
      ],
    },
  ];
}
