import React from "react";
import { getSectionType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { UITypeNameEnum } from "utils/generatedTypes";
import { ChartAreaSettings } from "./ChartAreaSettings";
import { ChatAreaSettings } from "./ChatAreaSettings";
import { DrawAreaSettings } from "./DrawAreaSettings";
import { GenPythonCodeSettings } from "./GenPythonCodeSettings";
import { IframeSettings } from "./IframeSettings";
import { ImageAreaSettings } from "./ImageAreaSettings";
import { SocialAreaSettings } from "./SocialAreaSettings";
import { TextBlockSettings } from "./TextBlockSettings";

const _SectionConfig = React.forwardRef(({ sectionId }, ref) => {
  return <SectionConfigCore sectionId={sectionId} />;
});

export const SectionConfig = React.memo(_SectionConfig);

function SectionConfigCore({ sectionId }) {
  return (
    <div className="flex min-h-0 flex-col gap-1 overflow-y-clip">
      <SpecializedConfiguration sectionId={sectionId} />
    </div>
  );
}

function SpecializedConfiguration({ sectionId }) {
  const sectionType = useProjectState((x) => {
    return getSectionType(sectionId, x);
  });
  switch (sectionType) {
    // case UITypeNameEnum.SECTION:
    // case UITypeNameEnum.GLOBAL_VARIABLES:
    //   return <InputAreaSettings sectionId={sectionId} />;
    case UITypeNameEnum.TEXT_BLOCK:
      return <TextBlockSettings sectionId={sectionId} />;
    case UITypeNameEnum.DRAW:
      return <DrawAreaSettings sectionId={sectionId} />;
    case UITypeNameEnum.IMAGE:
      return <ImageAreaSettings sectionId={sectionId} />;
    case UITypeNameEnum.CHART:
      return <ChartAreaSettings sectionId={sectionId} />;
    case UITypeNameEnum.SOCIAL:
      return <SocialAreaSettings sectionId={sectionId} />;
    case UITypeNameEnum.IFRAME:
      return <IframeSettings sectionId={sectionId} />;
    case UITypeNameEnum.CHAT:
      return <ChatAreaSettings sectionId={sectionId} />;
    case UITypeNameEnum.GEN_PYTHON_CODE:
      return <GenPythonCodeSettings />;
  }
}
