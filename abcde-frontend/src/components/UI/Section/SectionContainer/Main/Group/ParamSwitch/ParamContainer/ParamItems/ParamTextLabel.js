import { Heading, FormLabel, Tooltip } from "@chakra-ui/react";

export default function ParamTextLabel(props) {
  // temp_
  const tempBool = true;
  return (
    <FormLabel m="0">
      <Tooltip isDisabled={tempBool} hasArrow label="Label Tooltip Placeholder">
        <Heading fontSize="xs" fontWeight="900" color="gray.600">
          {props.paramInfo.name}
        </Heading>
      </Tooltip>
    </FormLabel>
  );
}
