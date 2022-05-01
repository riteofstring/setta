import { AddIcon } from "@chakra-ui/icons";
import { HStack, Heading, IconButton, Stack } from "@chakra-ui/react";
import { useAddKwarg } from "hooks/useKwarg";
import { useGetObjParamKwargInfos } from "hooks/useSectionContents";

import GetParamSwitch from "../Group/ParamSwitch/GetParamSwitch";

export default function KwargsControls({ sectionId, objInfoId, objInfo }) {
  const { kwargInfos } = useGetObjParamKwargInfos(sectionId, objInfoId);
  const addKwarg = useAddKwarg(sectionId, objInfo);
  return (
    <Stack>
      <HStack pt="1rem">
        <Heading as="h2" color="gray.400" size="sm" fontWeight="700">
          kwargs
        </Heading>
        <IconButton
          icon={<AddIcon w={2} />}
          size="xs"
          variant="outline"
          borderRadius="full"
          onClick={addKwarg}
        />
      </HStack>
      <GetParamSwitch
        sectionId={sectionId}
        infos={kwargInfos}
        isKwarg={true}
        objInfo={objInfo}
      />
    </Stack>
  );
}
