import _ from "lodash";
import { useProjectState } from "state/definitions";
import { route_create_top_level_section } from "utils/generatedEndpoints";
import {
  BaseSectionImplUnion,
  CodeLanguageEnum,
  Position,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { getCurrProjectConfigId } from "../sectionInfos";

export type CreateSectionsContextMenuInfo = {
  name: string;
  implSpecs: Partial<BaseSectionImplUnion> &
    Required<Pick<BaseSectionImplUnion, "type">>;
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

  const artifactGroupItems: Array<CreateSectionsContextMenuInfo> = [
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
      items: artifactGroupItems,
    },
    {
      group: "Embed",
      items: embedGroupItems,
    },
  ];
}

export function createTopLevelSectionFromImplSpecs(
  implSpecs: CreateSectionsContextMenuInfo["implSpecs"],
  position: Position,
) {
  route_create_top_level_section({
    projectConfigId: getCurrProjectConfigId(),
    implType: implSpecs.type,
    implOverrides: implSpecs,
    position,
  });
}
