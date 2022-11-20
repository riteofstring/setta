import { Stack, VStack } from "@chakra-ui/react";
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
  return (
    <GroupContainer
      sectionId={sectionId}
      objInfoId={objInfoId}
      infos={infos}
      isKwarg={true}
    />
  );
}

function _GroupContainer({ sectionId, objInfoId, infos, isKwarg }) {
  const kwargsStyleCondition = isKwarg && infos.length > 0;
  const kwargsControlCondition = !isKwarg;

  return (
    <VStack alignItems="stretch">
      <Stack
        py={kwargsStyleCondition && "1rem"}
        w="auto"
        mx={kwargsStyleCondition && ".75rem"}
      >
        <GetParamSwitch
          sectionId={sectionId}
          infos={infos}
          objInfoId={objInfoId}
          isKwarg={isKwarg}
        />
        {kwargsControlCondition && (
          <KwargsControls sectionId={sectionId} objInfoId={objInfoId} />
        )}
      </Stack>
    </VStack>
  );
}

const GroupContainer = React.memo(_GroupContainer);
export const ParamGroupContainer = React.memo(_ParamGroupContainer);
export const KwargGroupContainer = React.memo(_KwargGroupContainer);
