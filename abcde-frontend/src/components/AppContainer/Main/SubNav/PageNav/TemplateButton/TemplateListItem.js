import React from "react";
import { Box, useRadio } from "@chakra-ui/react";

const TemplateListItem = ({radio, setSelectedUIAndVersionName, uiName, versionName, children}) => {
  const { getInputProps, getCheckboxProps } = useRadio(radio);

  const input = getInputProps();
  const checkbox = getCheckboxProps();

  return (
    <Box as="label">
      <input {...input} />
      <Box
        {...checkbox}
        cursor="pointer"
        _checked={{
          bg: "teal.600",
          color: "white",
          borderColor: "teal.600",
        }}
        _focus={{
          boxShadow: "outline",
        }}
        px={5}
        py={3}
        onClick={() => setSelectedUIAndVersionName({uiName, versionName})}
        onMouseEnter={() => {}}
      >
        {children}
      </Box>
    </Box>
  );
};

export default React.memo(TemplateListItem);