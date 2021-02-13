import { Stack, HStack, Heading, FormControl } from "@chakra-ui/react";
import TheParam from "./TheParam/TheParam";
import PinButton from "./TheParam/PinButton/PinButton";
import { useStoreState } from "easy-peasy";

export default function GroupContainer({ sectionId }) {
  const sections = useStoreState((state) => state.master.sections);
  const selected = useStoreState((state) => state.master.selected);

  const getParamsArr = () => {
    try {
      let output = [];
      const { moduleName, name } = selected[
        sectionId
      ];
      const paramSource =
        sections[sectionId].moduleInfos[moduleName].objs[name].params;
      for (let key of Object.keys(paramSource)) {
        output.push(paramSource[key]);
      }
      return output;
    } catch (err) {
      return [];
    }
  };

  const paramsArr = getParamsArr();

  return (
    <Stack
      px="1.5rem"
      py="1rem"
      border="1px"
      borderColor="gray.300"
      borderRadius="md"
    >
      <HStack>
        <Heading as="h3" color="gray.400" size="md" fontWeight="bold">
          Group One
        </Heading>
        <PinButton />
      </HStack>
      <FormControl id="groupone">
        {paramsArr.length > 0 &&
          paramsArr.map((e, idx) => (
            <TheParam key={`${e.name}-${idx}`} parameters={e} />
          ))}
      </FormControl>
    </Stack>
  );
}
