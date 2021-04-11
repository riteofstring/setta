import {
  Stack,
  HStack,
  Heading,
  FormControl,
  IconButton,
} from "@chakra-ui/react";
import { AddIcon } from "@chakra-ui/icons";
import ParamSwitch from "./ParamSwitch/ParamSwitch";
import { useStoreState } from "easy-peasy";
import { useState, useEffect } from "react";

export default function GroupContainer({ sectionId, sectionInfo }) {
  const { moduleName, objName } = useStoreState((state) =>
    state.master.sections.getSelected(sectionId)
  );
  const kwargNames = Object.keys(
    sectionInfo.getObjData(moduleName, objName, "kwargs")
  );
  const [numKwargs, setNumKwargs] = useState(kwargNames.length);
  const paramNames = Object.keys(
    sectionInfo.getObjData(moduleName, objName, "params")
  );
  const showKwargsButton = objName || paramNames.length > 0;

  useEffect(() => {
    setNumKwargs(kwargNames.length);
  }, [sectionId]);

  console.log("GroupContainer", sectionId);

  return (
    <Stack>
      {paramNames.length > 0 && (
        <FormControl id="groupone">
          {paramNames.map((e, idx) => (
            <ParamSwitch
              key={`${e}-${idx}`}
              sectionId={sectionId}
              paramName={e}
            />
          ))}
        </FormControl>
      )}

      {showKwargsButton && (
        <HStack pt="1rem">
          <Heading as="h3" color="gray.600" size="sm" fontWeight="normal">
            {"KWARGS"}
          </Heading>
          <IconButton
            icon={<AddIcon w={2} />}
            size="xs"
            variant="outline"
            borderRadius="full"
            onClick={() => setNumKwargs(numKwargs + 1)}
          />
        </HStack>
      )}

      {/* {numKwargs > 0 && (
        <FormControl id="groupone">
          {[...Array(numKwargs)].map((e, idx) => (
            <ParamSwitch
              key={`KWARGS-${idx}`}
              sectionId={sectionId}
              metaUIType={"KWARGS"}
              inputKwargName={kwargNames[idx]}
              onClickDelete={() => setNumKwargs(Math.max(0, numKwargs - 1))}
            />
          ))}
        </FormControl>
      )} */}
    </Stack>
  );
}
