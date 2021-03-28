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

export default function GroupContainer({ sectionId }) {
  const [numKwargs, setNumKwargs] = useState(0);

  const thisSectionInfo = useStoreState(
    (state) => state.master.sections[sectionId]
  );

  const moduleName = useStoreState(
    (state) => state.master.idHierarchy[sectionId].moduleName
  );

  const objName = useStoreState(
    (state) => state.master.idHierarchy[sectionId].objName
  );

  const getParamsArr = () => {
    try {
      let parameters = [];
      const paramSource =
        thisSectionInfo.moduleInfos[moduleName].objs[objName].params;
      for (let key of Object.keys(paramSource)) {
        parameters.push(paramSource[key]);
      }
      return { moduleName, objName, parameters };
    } catch (err) {
      return { moduleName: null, objName: null, parameters: [] };
    }
  };

  const paramsInfo = getParamsArr();

  return (
    <Stack>
      {paramsInfo.parameters.length > 0 && (
        <FormControl id="groupone">
          {paramsInfo.parameters.map((e, idx) => (
            <ParamSwitch
              key={`${e.name}-${idx}`}
              sectionId={sectionId}
              moduleName={paramsInfo.moduleName}
              objName={paramsInfo.objName}
              parameters={e}
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
              moduleName={paramsInfo.moduleName}
              objName={paramsInfo.objName}
              parameters={{ name: "", defaultUIType: "", defaultVal: "" }}
              metaUIType={"KWARGS"}
            />
          ))}
        </FormControl>
      )}
    </Stack>
  );
}
