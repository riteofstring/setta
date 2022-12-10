import { useAreAllParamsNested } from "hooks/useParamUIType";
import {
  useGetAllParamInfos,
  useGetKwargInfos,
} from "hooks/useSectionContents";
import React from "react";
import KwargsControls from "../KwargsControls/KwargsControls";
import GetParamSwitch from "./ParamSwitch/GetParamSwitch";

function _ParamGroupContainer({ sectionId, objInfoId }) {
  const infos = useGetAllParamInfos(sectionId, objInfoId);
  return (
    <GroupContainer
      sectionId={sectionId}
      objInfoId={objInfoId}
      infos={infos}
      isKwarg={false}
    />
  );
}

function _KwargGroupContainer({ sectionId, objInfoId }) {
  const infos = useGetKwargInfos(sectionId, objInfoId);
  const allAreNested = useAreAllParamsNested(sectionId, infos);
  return (
    <GroupContainer
      sectionId={sectionId}
      objInfoId={objInfoId}
      infos={infos}
      isKwarg={true}
      allAreNested={allAreNested}
    />
  );
}

function _GroupContainer({
  sectionId,
  objInfoId,
  infos,
  isKwarg,
  allAreNested,
}) {
  const kwargsStyleCondition = isKwarg && infos.length > 0 && !allAreNested;
  const kwargsControlCondition = !isKwarg;

  return (
    <div className="flex flex-col items-stretch">
      <div className={kwargsStyleCondition ? "py-4 w-auto mx-3" : "w-auto"}>
        <GetParamSwitch
          sectionId={sectionId}
          infos={infos}
          objInfoId={objInfoId}
          isKwarg={isKwarg}
        />
        {kwargsControlCondition && (
          <KwargsControls sectionId={sectionId} objInfoId={objInfoId} />
        )}
      </div>
    </div>
  );
}

const GroupContainer = React.memo(_GroupContainer);
export const ParamGroupContainer = React.memo(_ParamGroupContainer);
export const KwargGroupContainer = React.memo(_KwargGroupContainer);
