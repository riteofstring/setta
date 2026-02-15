import React from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import { BrowserAreaSettings } from "./BrowserAreaSettings";
import { ChartAreaSettings } from "./ChartAreaSettings";
import { ChatAreaSettings } from "./ChatAreaSettings";
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
import { TextBlockSettings } from "./TextBlockSettings";

function _SectionConfig({ sectionId }: { sectionId: string }) {
  const sectionType = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return impl.type;
  });

  const mainContent = getSpecializedConfigurationContent(sectionType, sectionId);
  const appearanceContent = getAppearanceConfigurationContent(
    sectionType,
    sectionId,
  );
  const mainSectionDisabled = mainContent == null;
  const appearanceSectionDisabled = appearanceContent == null;

  return (
    <section
      data-testid="section-config-scroll-region"
      className="setta-pane-scroll flex min-h-0 flex-1 flex-col"
    >
      <SectionConfigAccordion
        defaultOpenValues={["section-config-main"]}
        items={[
          {
            value: "section-config-main",
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
            value: "section-config-appearance",
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
  sectionType: SectionTypeEnum,
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

function sectionTypeSupportsAppearanceSettings(
  sectionType: SectionTypeEnum,
): boolean {
  switch (sectionType) {
    case SectionTypeEnum.Callable:
    case SectionTypeEnum.Dict:
    case SectionTypeEnum.GlobalVariables:
    case SectionTypeEnum.Code:
    case SectionTypeEnum.TextBlock:
    case SectionTypeEnum.Prompt:
    case SectionTypeEnum.MetaControl:
    case SectionTypeEnum.Draw:
    case SectionTypeEnum.Image:
    case SectionTypeEnum.Chart:
    case SectionTypeEnum.Social:
    case SectionTypeEnum.IFrame:
    case SectionTypeEnum.Chat:
    case SectionTypeEnum.Browser:
      return true;
    case SectionTypeEnum.ListRoot:
    case SectionTypeEnum.Group:
    case SectionTypeEnum.GenPythonCode:
    case SectionTypeEnum.GenPythonMetadata:
    case SectionTypeEnum.Terminal:
      return false;
  }
}

function getSpecializedConfigurationContent(
  sectionType: SectionTypeEnum,
  sectionId: string,
): React.ReactNode | null {
  switch (sectionType) {
    case SectionTypeEnum.Callable:
    case SectionTypeEnum.Dict:
    case SectionTypeEnum.GlobalVariables:
      return <EdgePortsSettings sectionId={sectionId} />;
    case SectionTypeEnum.Code:
      return <CodeAreaSettings sectionId={sectionId} />;
    case SectionTypeEnum.TextBlock:
      return <TextBlockSettings sectionId={sectionId} />;
    case SectionTypeEnum.Prompt:
      return <PromptSettings sectionId={sectionId} />;
    case SectionTypeEnum.MetaControl:
      return <MetaControlSettings sectionId={sectionId} />;
    case SectionTypeEnum.Draw:
      return <DrawAreaSettings sectionId={sectionId} />;
    case SectionTypeEnum.Image:
      return <ImageAreaSettings sectionId={sectionId} />;
    case SectionTypeEnum.Chart:
      return <ChartAreaSettings sectionId={sectionId} />;
    case SectionTypeEnum.Social:
      return <SocialAreaSettings sectionId={sectionId} />;
    case SectionTypeEnum.IFrame:
      return <IframeSettings sectionId={sectionId} />;
    case SectionTypeEnum.Chat:
      return <ChatAreaSettings sectionId={sectionId} />;
    case SectionTypeEnum.Browser:
      return <BrowserAreaSettings sectionId={sectionId} />;
    case SectionTypeEnum.ListRoot:
    case SectionTypeEnum.Group:
    case SectionTypeEnum.GenPythonCode:
    case SectionTypeEnum.GenPythonMetadata:
    case SectionTypeEnum.Terminal:
      return null;
  }
}
