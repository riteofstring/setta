import { Stack } from "@chakra-ui/react";
import { useGetObjParamKwargInfos } from "hooks/useSectionContents";

import KwargsControls from "../KwargsControls/KwargsControls";
import GetParamSwitch from "./ParamSwitch/GetParamSwitch";

export default function GroupContainer({
  sectionId,
  objInfoId,
  selectedItemInSpecs,
  isKwarg,
}) {
  const { paramInfos, kwargInfos, objInfo } = useGetObjParamKwargInfos(
    sectionId,
    objInfoId
  );

  const kwargsCondition = selectedItemInSpecs || paramInfos.length > 0;

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
        objInfo={objInfo}
        isKwarg={isKwarg}
      />
      {!isKwarg && kwargsCondition && (
        <KwargsControls
          sectionId={sectionId}
          objInfoId={objInfoId}
          objInfo={objInfo}
        />
      )}
    </Stack>
  );
}
