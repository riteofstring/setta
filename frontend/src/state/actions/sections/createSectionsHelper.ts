import _ from "lodash";
import {
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  getPythonCodegenTarget,
  projectConfigHasPythonCodegen,
} from "utils/codegenTargets";
import { route_update_param_impl_config } from "utils/generatedEndpoints";
import {
  BaseSectionImplUnion,
  CodeLanguageEnum,
  CodeObjTypeEnum,
  createSectionSize,
  DateCalendarWeekStart,
  DateCalendarWeekStartEnum,
  DateControlMode,
  DateControlModeEnum,
  DateSelectionMode,
  DateSelectionModeEnum,
  Position,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { focusOnSectionSearch } from "utils/tabbingLogic";
import { createTopLevelSection } from "./createSections";

type ControlParamConfig = {
  dateControlMode?: DateControlMode;
  dateSelectionMode?: DateSelectionMode;
  dateCalendarWeekStart?: DateCalendarWeekStart;
};

export type CreateSectionsContextMenuInfo = {
  name: string;
  implSpecs: Partial<BaseSectionImplUnion> &
    Required<Pick<BaseSectionImplUnion, "type">>;
  controlCodeObjType?: CodeObjTypeEnum;
  controlParamConfig?: ControlParamConfig;
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
    { name: "Param Dict", implSpecs: { type: SectionTypeEnum.Dict } },
    {
      name: "List of Objects",
      implSpecs: { type: SectionTypeEnum.ListRoot },
    },
    { name: "Dict", implSpecs: { type: SectionTypeEnum.Group } },
    { name: "Text", implSpecs: { type: SectionTypeEnum.TextBlock } },
    { name: "Prompt", implSpecs: { type: SectionTypeEnum.Prompt } },
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
    {
      name: "Spreadsheet",
      implSpecs: { type: SectionTypeEnum.Spreadsheet },
    },
  ];

  const otherGroupItems: Array<CreateSectionsContextMenuInfo> = [
    { name: "Task Board", implSpecs: { type: SectionTypeEnum.TaskBoard } },
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
      group: "Other",
      items: otherGroupItems,
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
  void createTopLevelSection({
    implType: menuItem.implSpecs.type,
    controlCodeObjType: menuItem.controlCodeObjType,
    implOverrides: menuItem.implSpecs,
    position,
  }).then((sectionId) => {
    if (!sectionId) {
      return;
    }
    if (menuItem.controlParamConfig) {
      void applyMetaControlParamConfigAfterCreate(
        sectionId,
        menuItem.controlParamConfig,
      );
    }
    if (menuItem.implSpecs.type === SectionTypeEnum.Callable) {
      focusOnSectionSearch(sectionId);
    }
  });
}

function getMetaControlParamId(sectionId: string): string | null {
  const state = useProjectState.getState();
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  if (!state.sectionImpls[variant.impl]) {
    return null;
  }
  if (!state.sections[sectionId]) {
    return null;
  }
  const impl = getCurrEffectiveSectionImplOfType(
    state,
    sectionId,
    SectionTypeEnum.MetaControl,
  );
  return impl.metaControlParamId;
}

async function waitForMetaControlParamId(
  sectionId: string,
): Promise<string | null> {
  const attempts = 45;
  for (let idx = 0; idx < attempts; idx += 1) {
    const paramId = getMetaControlParamId(sectionId);
    if (paramId) {
      return paramId;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 16));
  }
  return null;
}

async function applyMetaControlParamConfigAfterCreate(
  sectionId: string,
  config: ControlParamConfig,
) {
  const controlParamId = await waitForMetaControlParamId(sectionId);
  if (!controlParamId) {
    return;
  }
  await route_update_param_impl_config({
    projectConfigId: getCurrProjectConfigId(),
    sectionId,
    paramInfoId: controlParamId,
    newConfig: config,
  });
}
