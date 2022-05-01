import { Stack } from "@chakra-ui/react";
import { useGetObjParamKwargInfos } from "hooks/useSectionContents";

import KwargsControls from "../KwargsControls/KwargsControls";
import GetParamSwitch from "./ParamSwitch/GetParamSwitch";

export default function GroupContainer({
  sectionId,
  objInfoId,
  selectedItemInSpecs,
}) {
  const { paramInfos, objInfo } = useGetObjParamKwargInfos(
    sectionId,
    objInfoId
  );

  const kwargsCondition = selectedItemInSpecs || paramInfos.length > 0;

  return (
    <Stack>
      <GetParamSwitch
        sectionId={sectionId}
        infos={paramInfos}
        objInfoId={objInfoId}
        objInfo={objInfo}
      />
      {kwargsCondition && (
        <KwargsControls
          sectionId={sectionId}
          objInfoId={objInfoId}
          objInfo={objInfo}
        />
      )}
    </Stack>
  );
}
