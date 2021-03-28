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
import { useState } from "react";
import { getParameters } from "../../../../../../utils/utils";

export default function GroupContainer({ sectionId, sectionInfo }) {
  const [numKwargs, setNumKwargs] = useState(0);

  const moduleName = useStoreState(
    (state) => state.master.idHierarchy[sectionId].moduleName
  );

  const objName = useStoreState(
    (state) => state.master.idHierarchy[sectionId].objName
  );

  const parameters = getParameters(sectionInfo, moduleName, objName);

  return (
    <Stack>
      {parameters.length > 0 && (
        <FormControl id="groupone">
          {parameters.map((e, idx) => (
            <ParamSwitch
              key={`${e.name}-${idx}`}
              sectionId={sectionId}
              moduleName={moduleName}
              objName={objName}
              parameter={e}
            />
          ))}
        </FormControl>
      )}

      {objName && (
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

      {numKwargs > 0 && (
        <FormControl id="groupone">
          {[...Array(numKwargs)].map((e, idx) => (
            <ParamSwitch
              key={`KWARGS-${idx}`}
              sectionId={sectionId}
              moduleName={moduleName}
              objName={objName}
              parameter={{ name: "", defaultUIType: "", defaultVal: "" }}
              metaUIType={"KWARGS"}
            />
          ))}
        </FormControl>
      )}
    </Stack>
  );
}
