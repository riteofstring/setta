import _ from "lodash";
import { usePluginSectionKinds } from "plugins/runtime";
import { addTemporaryNotification } from "state/actions/notifications";
import { getCurrProjectConfigId } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import {
  getPythonCodegenTarget,
  projectConfigHasPythonCodegen,
} from "utils/codegenTargets";
import { getErrorDetail, res200 } from "utils/endpointUtils";
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
  SettaNotificationTypeEnum,
} from "utils/generatedTypes";
import { focusOnSectionSearch } from "utils/tabbingLogic";
import { createTopLevelSectionWithResult } from "./createSections";

type ControlParamConfig = {
  dateControlMode?: DateControlMode;
  dateSelectionMode?: DateSelectionMode;
  dateCalendarWeekStart?: DateCalendarWeekStart;
};

export type CreateSectionsContextMenuInfo = {
  name: string;
  commandId?: string;
  implSpecs: Partial<BaseSectionImplUnion> &
    Required<Pick<BaseSectionImplUnion, "type">>;
  controlCodeObjType?: CodeObjTypeEnum;
  controlParamConfig?: ControlParamConfig;
};

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

export function useCreateSectionsList() {
  const pluginSectionKinds = usePluginSectionKinds();
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

  const codeGroupItems = getBaseCodeSectionCreateItems();

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

  const workflowGroupItems: Array<CreateSectionsContextMenuInfo> = [
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

  const pluginSectionItems: Array<CreateSectionsContextMenuInfo> =
    pluginSectionKinds.map((sectionKind) => ({
      name: sectionKind.title,
      commandId: `plugin-section:${sectionKind.pluginId}:${sectionKind.kind}`,
      implSpecs: {
        type: SectionTypeEnum.Plugin,
        pluginId: sectionKind.pluginId,
        kind: sectionKind.kind,
        data: sectionKind.initialData ?? {},
      },
    }));

  const groups: Array<{
    group: string;
    items: Array<CreateSectionsContextMenuInfo>;
  }> = [
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
      group: "Workflow",
      items: workflowGroupItems,
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
  if (pluginSectionItems.length > 0) {
    groups.push({
      group: "Plugins",
      items: pluginSectionItems,
    });
  }
  return groups;
}

export function createTopLevelSectionFromImplSpecs(
  menuItem: CreateSectionsContextMenuInfo,
  position: Position | null = null,
) {
  void createTopLevelSectionWithResult({
    implType: menuItem.implSpecs.type,
    controlCodeObjType: menuItem.controlCodeObjType,
    implOverrides: menuItem.implSpecs,
    position,
  }).then((createdSection) => {
    if (!createdSection) {
      return;
    }
    const { sectionId, metaControlParamId } = createdSection;
    if (menuItem.controlParamConfig) {
      void applyMetaControlParamConfigAfterCreate(
        sectionId,
        metaControlParamId,
        menuItem.controlParamConfig,
      );
    }
    if (menuItem.implSpecs.type === SectionTypeEnum.Callable) {
      focusOnSectionSearch(sectionId);
    }
  });
}

async function applyMetaControlParamConfigAfterCreate(
  sectionId: string,
  controlParamId: string | null,
  config: ControlParamConfig,
) {
  if (!controlParamId) {
    return;
  }
  const response = await route_update_param_impl_config({
    projectConfigId: getCurrProjectConfigId(),
    sectionId,
    paramInfoId: controlParamId,
    newConfig: config,
  });
  if (!res200(response)) {
    addTemporaryNotification(
      getErrorDetail(response.data) ??
        "Failed to apply meta control configuration after section creation.",
      SettaNotificationTypeEnum.error,
    );
  }
}
