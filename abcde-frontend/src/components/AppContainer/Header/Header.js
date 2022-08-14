import { Flex, Heading, Link, Spacer, Text } from "@chakra-ui/react";
import { Link as RRLink } from "react-router-dom";

import ColorModeToggle from "./ColorModeToggle/ColorModeToggle";
import MainSideDrawer from "./MainSideDrawer/MainSideDrawer";
import SubNav from "./SubNav/SubNav";

export default function HeaderContainer() {
  return (
    <Flex width="calc(100vw - 5rem)" height="4rem" align="center">
      <Link
        variant="ghost"
        as={RRLink}
        to="/home"
        _hover={{ textDecoration: "none" }}
      >
        <Heading
          fontSize="sm"
          fontWeight="100"
          letterSpacing="10px"
          color="gray.900"
          mr="1rem"
        >
          IO
          <Text as="span" fontWeight="800">
            VUU
          </Text>
        </Heading>
      </Link>
      <SubNav />
      <Spacer />
      <ColorModeToggle />
      <MainSideDrawer />
    </Flex>
  );
}
