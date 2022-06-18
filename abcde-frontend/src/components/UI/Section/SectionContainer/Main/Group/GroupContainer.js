import { Stack } from "@chakra-ui/react";
import { useGetObjParamKwargInfos } from "hooks/useSectionContents";
import React from "react";

import KwargsControls from "../KwargsControls/KwargsControls";
import GetParamSwitch from "./ParamSwitch/GetParamSwitch";

function _GroupContainer({ sectionId, objInfoId, isKwarg }) {
  const { paramInfos, kwargInfos } = useGetObjParamKwargInfos(
    sectionId,
    objInfoId
  );

  const kwargsCondition = paramInfos.length > 0;

  return (
    <Stack
      py={kwargInfos.length > 0 && isKwarg && "1rem"}
      w="auto"
      mx={kwargInfos.length > 0 && isKwarg && ".75rem"}
    >
      <GetParamSwitch
        sectionId={sectionId}
        infos={isKwarg ? kwargInfos : paramInfos}
        objInfoId={objInfoId}
        isKwarg={isKwarg}
      />
      {!isKwarg && kwargsCondition && (
        <KwargsControls sectionId={sectionId} objInfoId={objInfoId} />
      )}
    </Stack>
  );
}

const GroupContainer = React.memo(_GroupContainer);
export default GroupContainer;
