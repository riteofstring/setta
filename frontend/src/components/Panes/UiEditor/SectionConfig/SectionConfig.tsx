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
import { SocialAreaSettings } from "./SocialAreaSettings";
import { TextBlockSettings } from "./TextBlockSettings";

function _SectionConfig({ sectionId }: { sectionId: string }) {
  return (
    <div className="flex min-h-0 flex-col gap-1 overflow-y-clip">
      <SpecializedConfiguration sectionId={sectionId} />
    </div>
  );
}

export const SectionConfig = React.memo(_SectionConfig);

function SpecializedConfiguration({ sectionId }: { sectionId: string }) {
  const sectionType = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return impl.type;
  });
  switch (sectionType) {
    // case SectionTypeEnum.SECTION:
    // case SectionTypeEnum.GLOBAL_VARIABLES:
    //   return <InputAreaSettings sectionId={sectionId} />;
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
  }
}
