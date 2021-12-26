import { Button, Icon, useDisclosure } from "@chakra-ui/react";
import { HiOutlineHome } from "react-icons/hi";
import { Link } from "react-router-dom";

export default function HomeButtonComp() {
  return (
    <Button
      leftIcon={<Icon as={HiOutlineHome} />}
      as={Link}
      to="/home"
      size="xs"
      mr="-px"
      variant="ghost"
      // border="1px"
      // borderColor="gray.200"
    >
      Home
    </Button>
  );
}
