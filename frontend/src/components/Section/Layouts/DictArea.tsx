import { recordSettingsGraphSubstrateCanaryMotionAttributionDuration } from "components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation";
import React from "react";
import { SectionTypeEnum } from "utils/generatedTypes";
import { ParamGroupContainer } from "../../Params/GroupContainer";
import { KwargsControls } from "../SectionParts/KwargsControls";

function handleKwargsControlsRender(
  _id: string,
  _phase: "mount" | "nested-update" | "update",
  actualDuration: number,
) {
  recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
    "presentedSceneSectionKwargsControlsReactRender",
    actualDuration,
  );
}

function handleParamGroupContainerRender(
  _id: string,
  _phase: "mount" | "nested-update" | "update",
  actualDuration: number,
) {
  recordSettingsGraphSubstrateCanaryMotionAttributionDuration(
    "presentedSceneSectionParamGroupContainerReactRender",
    actualDuration,
  );
}

function _DictArea({ sectionId, bgColor }) {
  return (
    <>
      <React.Profiler
        id={`dict-area-kwargs-controls:${sectionId}`}
        onRender={handleKwargsControlsRender}
      >
        <KwargsControls sectionId={sectionId} />
      </React.Profiler>
      <React.Profiler
        id={`dict-area-param-group-container:${sectionId}`}
        onRender={handleParamGroupContainerRender}
      >
        <ParamGroupContainer
          sectionId={sectionId}
          bgColor={bgColor}
          sectionTypeName={SectionTypeEnum.Dict}
        />
      </React.Profiler>
    </>
  );
}

export const DictArea = React.memo(_DictArea);
