import {
  Stack,
  HStack,
  Heading,
  FormControl,
  IconButton,
} from "@chakra-ui/react";
import { AddIcon } from "@chakra-ui/icons";
import TheParam from "./TheParam/TheParam";
import PinButton from "./TheParam/PinButton/PinButton";
import { useStoreState } from "easy-peasy";

export default function GroupContainer({ sectionId }) {
  const thisSectionInfo = useStoreState(
    (state) => state.master.sections[sectionId]
  );
  const thisSectionSelected = useStoreState(
    (state) => state.master.selected[sectionId]
  );

  const getParamsArr = () => {
    try {
      let parameters = [];
      const { moduleName, name: objName } = thisSectionSelected;
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
  const tempKwargs = true;
  return (
    <Stack>
      {paramsInfo.parameters.length > 0 && (
        <HStack pt="1rem">
          <Heading as="h3" color="gray.600" size="sm" fontWeight="normal">
            {tempKwargs ? "KWARGS" : "Parameters"}
          </Heading>
          <IconButton
            icon={<AddIcon w={2} />}
            size="xs"
            variant="outline"
            borderRadius="full"
          />
        </HStack>
      )}

      <FormControl id="groupone">
        {paramsInfo.parameters.length > 0 &&
          paramsInfo.parameters.map((e, idx) => (
            <TheParam
              key={`${e.name}-${idx}`}
              sectionId={sectionId}
              moduleName={paramsInfo.moduleName}
              objName={paramsInfo.objName}
              parameters={e}
              idx={idx}
            />
          ))}
      </FormControl>
    </Stack>
  );
}
