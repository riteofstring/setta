import _ from "lodash";
import { useProjectState } from "state/definitions";
import {
  getPythonCodegenTarget,
  projectConfigHasPythonCodegen,
} from "utils/codegenTargets";
import {
  BaseSectionImplUnion,
  CodeLanguageEnum,
  CodeObjTypeEnum,
  Position,
  SectionTypeEnum,
  createSectionSize,
} from "utils/generatedTypes";
import { createTopLevelSection } from "./createSections";

export type CreateSectionsContextMenuInfo = {
  name: string;
  implSpecs: Partial<BaseSectionImplUnion> &
    Required<Pick<BaseSectionImplUnion, "type">>;
  controlCodeObjType?: CodeObjTypeEnum;
};

export function useCreateSectionsList() {
  const singletonSections = useProjectState(
    (x) => x.singletonSections,
    _.isEqual,
  );
  const pythonCodegenEnabled = useProjectState((x) =>
    projectConfigHasPythonCodegen(x.projectConfig),
  );
  const metadataEnabled = useProjectState(
    (x) => getPythonCodegenTarget(x.projectConfig)?.generateMetadata ?? false,
  );
  const sectionGroupItems: Array<CreateSectionsContextMenuInfo> = [
    { name: "Callable", implSpecs: { type: SectionTypeEnum.Callable } },
    { name: "Dict", implSpecs: { type: SectionTypeEnum.Dict } },
    {
      name: "List of Objects",
      implSpecs: { type: SectionTypeEnum.ListRoot },
    },
    { name: "Group", implSpecs: { type: SectionTypeEnum.Group } },
    { name: "Text", implSpecs: { type: SectionTypeEnum.TextBlock } },
  ];

  if (!singletonSections.GlobalVariables) {
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

  if (pythonCodegenEnabled && !singletonSections.GenPythonCode) {
    codeGroupItems.push({
      name: "Show Generated Python",
      implSpecs: {
        type: SectionTypeEnum.GenPythonCode,
      },
    });
  }
  if (metadataEnabled && !singletonSections.GenPythonMetadata) {
    codeGroupItems.push({
      name: "Show Generated Python Metadata",
      implSpecs: {
        type: SectionTypeEnum.GenPythonMetadata,
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

  const metaControlGroupItems: Array<CreateSectionsContextMenuInfo> = [
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
      name: "Text Area",
      implSpecs: {
        type: SectionTypeEnum.MetaControl,
      },
      controlCodeObjType: CodeObjTypeEnum.TextAreaParam,
    },
    {
      name: "Code Input",
      implSpecs: {
        type: SectionTypeEnum.MetaControl,
      },
      controlCodeObjType: CodeObjTypeEnum.CodeParam,
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
      group: "MetaControls",
      items: metaControlGroupItems,
    },
    {
      group: "Embed",
      items: embedGroupItems,
    },
  ];
}

export function createTopLevelSectionFromImplSpecs(
  menuItem: CreateSectionsContextMenuInfo,
  position: Position | null = null,
) {
  createTopLevelSection({
    implType: menuItem.implSpecs.type,
    controlCodeObjType: menuItem.controlCodeObjType,
    implOverrides: menuItem.implSpecs,
    position,
  });
}
