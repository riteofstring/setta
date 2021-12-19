import { AddIcon } from "@chakra-ui/icons";
import {
  HStack,
  Heading,
  IconButton,
  Stack,
  FormControl,
} from "@chakra-ui/react";

import {
  useGetObjParamKwargInfos,
  useParamChildId,
  useGetParamUIType,
  useParamEnteredValue,
  useInitializeUIType,
  useAddKwarg,
  useDeleteKwarg,
  useSetKwargName,
} from "../../../../../../hooks/useCreateInfo";
import ParamSwitch from "./ParamSwitch/ParamSwitch";

export default function GroupContainer({ sectionId, objInfoId }) {
  console.log("GroupContainer");
  const { paramInfos, kwargInfos } = useGetObjParamKwargInfos(
    sectionId,
    objInfoId
  );
  const enteredValueFn = useParamEnteredValue(sectionId, objInfoId);
  const childIdFn = useParamChildId(sectionId, objInfoId);
  const getUITypeFn = useGetParamUIType(sectionId, objInfoId);
  const getInitUITypeFn = useInitializeUIType(sectionId, objInfoId);
  const addKwarg = useAddKwarg(sectionId, objInfoId);
  const getDeleteKwargFn = useDeleteKwarg(sectionId, objInfoId);
  const setKwargNameFn = useSetKwargName(sectionId, objInfoId);
  const kwargsCondition = objInfoId || paramInfos.length > 0;

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
              getInitUITypeFn={getInitUITypeFn}
              getDeleteKwargFn={getDeleteKwargFn}
              setKwargNameFn={setKwargNameFn}
              isKwarg={isKwarg}
            />
          ))}
        </FormControl>
      )
    );
  }

  function kwargsControls() {
    return (
      <Stack>
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

  return (
    <Stack>
      {getParamSwitch(paramInfos)} {kwargsCondition && kwargsControls()}
    </Stack>
  );
}
