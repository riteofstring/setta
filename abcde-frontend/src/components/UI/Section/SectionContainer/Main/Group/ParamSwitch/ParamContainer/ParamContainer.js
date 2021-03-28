import { HStack, Spacer, FormControl } from "@chakra-ui/react";
import ParamInput from "./ParamItems/ParamInput";
import PrefButton from "./ParamItems/ParamPref/PrefButton";

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
        <PrefButton />
        <ParamInput {...props} />
      </HStack>
    </FormControl>
  );
}
