import React from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
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
import { SectionConfigAccordion } from "./SectionConfigAccordion";
import { SectionStyleColorSettings } from "./SectionStyleColorSettings";
import { SectionTagColorSettings } from "./SectionTagColorSettings";
import { SocialAreaSettings } from "./SocialAreaSettings";
import { SpreadsheetSectionSettings } from "./SpreadsheetSectionSettings";
import { StateMachineSectionSettings } from "./StateMachineSectionSettings";
import { TaskBoardSettings } from "./TaskBoardSettings";
import { TextBlockSettings } from "./TextBlockSettings";

const SECTION_CONFIG_MAIN_VALUE = "section-config-main";
const SECTION_CONFIG_APPEARANCE_VALUE = "section-config-appearance";

type SectionConfigPanelValue =
  | typeof SECTION_CONFIG_MAIN_VALUE
  | typeof SECTION_CONFIG_APPEARANCE_VALUE;

type SectionSettingsComponent = React.ComponentType<{ sectionId: string }>;

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

function areOpenValuesEqual(a: Array<string>, b: Array<string>): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function _SectionConfig({ sectionId }: { sectionId: string }) {
  const sectionType = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return impl.type;
  });

  const mainContent = getSpecializedConfigurationContent(
    sectionType,
    sectionId,
  );
  const appearanceContent = getAppearanceConfigurationContent(
    sectionType,
    sectionId,
  );
  const mainSectionDisabled = mainContent == null;
  const appearanceSectionDisabled = appearanceContent == null;
  const defaultOpenValues = React.useMemo(
    () =>
      getDefaultSectionConfigOpenValues(
        mainSectionDisabled,
        appearanceSectionDisabled,
      ),
    [appearanceSectionDisabled, mainSectionDisabled],
  );
  const [openValues, setOpenValues] =
    React.useState<Array<string>>(defaultOpenValues);
  const resolvedOpenValues = React.useMemo(
    () =>
      normalizeSectionConfigOpenValues(
        openValues,
        mainSectionDisabled,
        appearanceSectionDisabled,
      ),
    [appearanceSectionDisabled, mainSectionDisabled, openValues],
  );

  React.useEffect(() => {
    setOpenValues(defaultOpenValues);
  }, [defaultOpenValues, sectionId]);

  React.useEffect(() => {
    setOpenValues((currentOpenValues) => {
      const nextOpenValues = normalizeSectionConfigOpenValues(
        currentOpenValues,
        mainSectionDisabled,
        appearanceSectionDisabled,
      );
      return areOpenValuesEqual(nextOpenValues, currentOpenValues)
        ? currentOpenValues
        : nextOpenValues;
    });
  }, [appearanceSectionDisabled, mainSectionDisabled]);

  return (
    <section
      data-testid="section-config-scroll-region"
      className="setta-pane-scroll flex min-h-0 flex-1 flex-col"
    >
      <SectionConfigAccordion
        openValues={resolvedOpenValues}
        onOpenValuesChange={setOpenValues}
        items={[
          {
            value: SECTION_CONFIG_MAIN_VALUE,
            title: "Section Settings",
            triggerTestId: "section-config-accordion-main",
            disabled: mainSectionDisabled,
            disabledReason: "No section settings available",
            content: mainContent ?? (
              <div className="text-xs text-setta-500 dark:text-setta-500">
                No section settings available.
              </div>
            ),
          },
          {
            value: SECTION_CONFIG_APPEARANCE_VALUE,
            title: "Appearance",
            triggerTestId: "section-config-accordion-appearance",
            disabled: appearanceSectionDisabled,
            disabledReason: "No appearance settings available",
            content: appearanceContent ?? (
              <div className="text-xs text-setta-500 dark:text-setta-500">
                No appearance settings available.
              </div>
            ),
          },
        ]}
      />
    </section>
  );
}

export const SectionConfig = React.memo(_SectionConfig);

function getAppearanceConfigurationContent(
  sectionType: SectionType,
  sectionId: string,
): React.ReactNode | null {
  if (!sectionTypeSupportsAppearanceSettings(sectionType)) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <SectionStyleColorSettings sectionId={sectionId} />
      <SectionTagColorSettings sectionId={sectionId} />
    </div>
  );
}

export function sectionTypeSupportsAppearanceSettings(
  sectionType: SectionType,
): boolean {
  return getSectionConfigEntry(sectionType)?.appearanceEnabled ?? false;
}

function getSpecializedConfigurationContent(
  sectionType: SectionType,
  sectionId: string,
): React.ReactNode | null {
  const SettingsComponent = getSectionConfigEntry(sectionType)?.mainComponent;
  return SettingsComponent ? <SettingsComponent sectionId={sectionId} /> : null;
}
