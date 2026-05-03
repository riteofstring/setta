import React from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import type { SectionType } from "utils/generatedTypes";
import { SectionConfigAccordion } from "./SectionConfigAccordion";
import { SectionStyleColorSettings } from "./SectionStyleColorSettings";
import { SectionTagColorSettings } from "./SectionTagColorSettings";
import {
  SECTION_CONFIG_APPEARANCE_VALUE,
  SECTION_CONFIG_MAIN_VALUE,
  getDefaultSectionConfigOpenValues,
  getSectionSettingsComponent,
  normalizeSectionConfigOpenValues,
  sectionTypeSupportsAppearanceSettings,
} from "./sectionConfigModel";

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

function getSpecializedConfigurationContent(
  sectionType: SectionType,
  sectionId: string,
): React.ReactNode | null {
  const SettingsComponent = getSectionSettingsComponent(sectionType);
  return SettingsComponent ? <SettingsComponent sectionId={sectionId} /> : null;
}
