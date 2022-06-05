import { CloseButton } from "@chakra-ui/react";

export default function CustomCloseButton(props) {
  return (
    <CloseButton borderRadius="full" variant="ghost" size="sm" {...props} />
  );
}
