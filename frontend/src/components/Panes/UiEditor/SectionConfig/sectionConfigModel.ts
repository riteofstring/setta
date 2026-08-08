import type { ComponentType } from "react";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import { BrowserAreaSettings } from "./BrowserAreaSettings";
import { ChartAreaSettings } from "./ChartAreaSettings";
import { ChatAreaSettings } from "./ChatAreaSettings";
import { ChildDefaultsSettings } from "./ChildDefaultsSettings";
import { CodeAreaSettings } from "./CodeAreaSettings";
import { DrawAreaSettings } from "./DrawAreaSettings";
import { EdgePortsSettings } from "./EdgePortsSettings";
import { IframeSettings } from "./IframeSettings";
import { ImageAreaSettings } from "./ImageAreaSettings";
import { MetaControlSettings } from "./MetaControlSettings";
import { PromptSettings } from "./PromptSettings";
import { SocialAreaSettings } from "./SocialAreaSettings";
import { SpreadsheetSectionSettings } from "./SpreadsheetSectionSettings";
import { StateMachineSectionSettings } from "./StateMachineSectionSettings";
import { TaskBoardSettings } from "./TaskBoardSettings";
import { TextBlockSettings } from "./TextBlockSettings";

export const SECTION_CONFIG_MAIN_VALUE = "section-config-main";
export const SECTION_CONFIG_APPEARANCE_VALUE = "section-config-appearance";

type SectionConfigPanelValue =
  | typeof SECTION_CONFIG_MAIN_VALUE
  | typeof SECTION_CONFIG_APPEARANCE_VALUE;

type SectionSettingsComponent = ComponentType<{ sectionId: string }>;

type SectionConfigEntry = {
  appearanceEnabled: boolean;
  mainComponent?: SectionSettingsComponent;
};

const SECTION_CONFIG_BY_TYPE = new Map<SectionType, SectionConfigEntry>([
  [
    SectionTypeEnum.Callable,
    { appearanceEnabled: true, mainComponent: EdgePortsSettings },
  ],
  [
    SectionTypeEnum.Dict,
    { appearanceEnabled: true, mainComponent: EdgePortsSettings },
  ],
  [
    SectionTypeEnum.GlobalVariables,
    { appearanceEnabled: true, mainComponent: EdgePortsSettings },
  ],
  [
    SectionTypeEnum.ListRoot,
    { appearanceEnabled: true, mainComponent: ChildDefaultsSettings },
  ],
  [
    SectionTypeEnum.Group,
    { appearanceEnabled: true, mainComponent: ChildDefaultsSettings },
  ],
  [
    SectionTypeEnum.Code,
    { appearanceEnabled: true, mainComponent: CodeAreaSettings },
  ],
  [
    SectionTypeEnum.TextBlock,
    { appearanceEnabled: true, mainComponent: TextBlockSettings },
  ],
  [
    SectionTypeEnum.Prompt,
    { appearanceEnabled: true, mainComponent: PromptSettings },
  ],
  [
    SectionTypeEnum.MetaControl,
    { appearanceEnabled: true, mainComponent: MetaControlSettings },
  ],
  [
    SectionTypeEnum.Draw,
    { appearanceEnabled: true, mainComponent: DrawAreaSettings },
  ],
  [
    SectionTypeEnum.Image,
    { appearanceEnabled: true, mainComponent: ImageAreaSettings },
  ],
  [
    SectionTypeEnum.Chart,
    { appearanceEnabled: true, mainComponent: ChartAreaSettings },
  ],
  [
    SectionTypeEnum.Social,
    { appearanceEnabled: true, mainComponent: SocialAreaSettings },
  ],
  [
    SectionTypeEnum.IFrame,
    { appearanceEnabled: true, mainComponent: IframeSettings },
  ],
  [
    SectionTypeEnum.Chat,
    { appearanceEnabled: true, mainComponent: ChatAreaSettings },
  ],
  [
    SectionTypeEnum.Browser,
    { appearanceEnabled: true, mainComponent: BrowserAreaSettings },
  ],
  [
    SectionTypeEnum.TaskBoard,
    { appearanceEnabled: true, mainComponent: TaskBoardSettings },
  ],
  [
    SectionTypeEnum.Spreadsheet,
    { appearanceEnabled: true, mainComponent: SpreadsheetSectionSettings },
  ],
  [
    SectionTypeEnum.StateMachineStart,
    { appearanceEnabled: true, mainComponent: StateMachineSectionSettings },
  ],
  [
    SectionTypeEnum.StateMachineGate,
    { appearanceEnabled: true, mainComponent: StateMachineSectionSettings },
  ],
  [
    SectionTypeEnum.StateMachineEnd,
    { appearanceEnabled: true, mainComponent: StateMachineSectionSettings },
  ],
  [SectionTypeEnum.GenPythonCode, { appearanceEnabled: true }],
  [SectionTypeEnum.GenPythonMetadata, { appearanceEnabled: true }],
  [SectionTypeEnum.Terminal, { appearanceEnabled: true }],
]);

function getSectionConfigEntry(
  sectionType: SectionType,
): SectionConfigEntry | null {
  return SECTION_CONFIG_BY_TYPE.get(sectionType) ?? null;
}

export function getDefaultSectionConfigOpenValues(
  mainSectionDisabled: boolean,
  appearanceSectionDisabled: boolean,
): Array<SectionConfigPanelValue> {
  if (!mainSectionDisabled) {
    return [SECTION_CONFIG_MAIN_VALUE];
  }
  if (!appearanceSectionDisabled) {
    return [SECTION_CONFIG_APPEARANCE_VALUE];
  }
  return [];
}

export function normalizeSectionConfigOpenValues(
  openValues: Array<string>,
  mainSectionDisabled: boolean,
  appearanceSectionDisabled: boolean,
): Array<string> {
  const disabledOpenValueSet = new Set<string>();
  if (mainSectionDisabled) {
    disabledOpenValueSet.add(SECTION_CONFIG_MAIN_VALUE);
  }
  if (appearanceSectionDisabled) {
    disabledOpenValueSet.add(SECTION_CONFIG_APPEARANCE_VALUE);
  }
  const filteredOpenValues = openValues.filter(
    (value) => !disabledOpenValueSet.has(value),
  );
  if (filteredOpenValues.length > 0) {
    return filteredOpenValues;
  }
  return getDefaultSectionConfigOpenValues(
    mainSectionDisabled,
    appearanceSectionDisabled,
  );
}

export function sectionTypeSupportsAppearanceSettings(
  sectionType: SectionType,
): boolean {
  return getSectionConfigEntry(sectionType)?.appearanceEnabled ?? false;
}

export function getSectionSettingsComponent(
  sectionType: SectionType,
): SectionSettingsComponent | null {
  return getSectionConfigEntry(sectionType)?.mainComponent ?? null;
}
