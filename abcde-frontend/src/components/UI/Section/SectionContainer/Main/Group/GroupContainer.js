import { AddIcon } from "@chakra-ui/icons";
import {
  HStack,
  Heading,
  IconButton,
  Stack,
  FormControl,
} from "@chakra-ui/react";

import {
  useGetAllParamInfos,
  useParamChildId,
  useGetParamUIType,
  useParamEnteredValue,
  useInitializeUIType,
  useAddKwarg,
  useGetKwargInfos,
  useDeleteKwarg,
} from "../../../../../../hooks/useCreateInfo";
import ParamSwitch from "./ParamSwitch/ParamSwitch";

export default function GroupContainer({ sectionId, objInfo }) {
  console.log("GroupContainer", objInfo);
  const paramInfos = useGetAllParamInfos(sectionId, objInfo);
  const kwargInfos = useGetKwargInfos(sectionId, objInfo);
  const enteredValueFn = useParamEnteredValue(sectionId);
  const childIdFn = useParamChildId(sectionId);
  const getUITypeFn = useGetParamUIType(sectionId);
  const initUITypeFn = useInitializeUIType(sectionId);
  const addKwarg = useAddKwarg(sectionId, objInfo);
  const deleteKwarg = useDeleteKwarg(sectionId, objInfo);

  function getParamSwitch(infos, isKwarg = false) {
    return (
      infos.length > 0 && (
        <FormControl id="groupone">
          {infos.map((e, idx) => (
            <ParamSwitch
              key={`${e.name}-${idx}`}
              sectionId={sectionId}
              paramInfo={e}
              enteredValueFn={enteredValueFn}
              childIdFn={childIdFn}
              getUITypeFn={getUITypeFn}
              initUITypeFn={initUITypeFn}
              deleteKwarg={deleteKwarg}
              isKwarg={isKwarg}
            />
          ))}
        </FormControl>
      )
    );
  }

  return (
    <Stack>
      {getParamSwitch(paramInfos)}

      <HStack pt="1rem">
        <Heading as="h3" color="gray.600" size="sm" fontWeight="normal">
          {"KWARGS"}
        </Heading>
        <IconButton
          icon={<AddIcon w={2} />}
          size="xs"
          variant="outline"
          borderRadius="full"
          onClick={addKwarg}
        />
      </HStack>

      {getParamSwitch(kwargInfos, true)}
    </Stack>
  );
}
