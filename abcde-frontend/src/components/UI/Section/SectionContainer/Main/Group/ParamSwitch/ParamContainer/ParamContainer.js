import { HStack, Spacer, FormControl } from "@chakra-ui/react";
import ParamInput from "./ParamItems/ParamInput";
import ParamPrefButton from "./ParamItems/ParamPrefButton";

export default function ParamContainer(props) {
  return (
    <FormControl as="fieldset">
      <HStack
        px=".75rem"
        pb="0.5rem"
        pt="0.25rem"
        borderRadius=".5rem"
        _hover={{
          backgroundColor: "white",
        }}
      >
        {props.children}
        <Spacer />
        <ParamPrefButton />
        <ParamInput {...props} />
      </HStack>
    </FormControl>
  );
}
