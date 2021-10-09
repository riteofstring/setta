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
} from "../../../../../../utils/useCreateInfo";
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

  function getParamSwitch(infos, isKwargs = false) {
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

      {getParamSwitch(kwargInfos)}
    </Stack>
  );
}
