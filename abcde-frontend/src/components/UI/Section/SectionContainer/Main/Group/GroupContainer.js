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
  useInitializeEnteredValue,
  useParamEnteredValue,
  useInitializeUIType,
  useAddKwarg,
  useDeleteKwarg,
} from "hooks/useCreateInfo";
import ParamSwitch from "./ParamSwitch/ParamSwitch";

export default function GroupContainer({ sectionId, objInfoId }) {
  console.log("GroupContainer");
  const { objInfo, paramInfos, kwargInfos } = useGetObjParamKwargInfos(
    sectionId,
    objInfoId
  );
  const childIdFn = useParamChildId(sectionId);
  const getUITypeFn = useGetParamUIType(sectionId);
  const enteredValueFn = useParamEnteredValue(sectionId);
  const getInitUITypeFn = useInitializeUIType(sectionId);
  const getInitEnteredValueFn = useInitializeEnteredValue(sectionId);
  const addKwarg = useAddKwarg(sectionId, objInfo);
  const getDeleteKwargFn = useDeleteKwarg(sectionId, objInfo);
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
              childIdFn={childIdFn}
              getUITypeFn={getUITypeFn}
              enteredValueFn={enteredValueFn}
              getInitUITypeFn={getInitUITypeFn}
              getInitEnteredValueFn={getInitEnteredValueFn}
              getDeleteKwargFn={getDeleteKwargFn}
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
