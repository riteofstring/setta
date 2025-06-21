import _ from "lodash";
import { useProjectState } from "state/definitions";
import {
  BaseSectionImplUnion,
  CodeLanguageEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";

type CreateSectionsContextMenuInfo = {
  name: string;
  specificProps: Partial<BaseSectionImplUnion>;
};

export function useCreateSectionsList() {
  const singletonSections = useProjectState(
    (x) => x.singletonSections,
    _.isEqual,
  );
  const sectionGroupItems: Array<CreateSectionsContextMenuInfo> = [
    { name: "Section", specificProps: { type: SectionTypeEnum.Callable } },
    { name: "List", specificProps: { type: SectionTypeEnum.ListRoot } },
    { name: "Dict", specificProps: { type: SectionTypeEnum.DictRoot } },
    { name: "Group", specificProps: { type: SectionTypeEnum.Group } },
    { name: "Text", specificProps: { type: SectionTypeEnum.TextBlock } },
  ];

  if (!singletonSections[SectionTypeEnum.GlobalVariables]) {
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

  if (!singletonSections[SectionTypeEnum.GenPythonCode]) {
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
