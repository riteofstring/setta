import { Flex, Heading, Link, Spacer, Text } from "@chakra-ui/react";
import "@fontsource/jetbrains-mono/300.css";
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
          fontSize="md"
          letterSpacing="-1px"
          color="gray.600"
          mr="1rem"
          fontFamily="JetBrains Mono"
        >
          r
          <Text as="span" color="#00B5D8">
            un
          </Text>
          coder
        </Heading>
      </Link>
      <SubNav />
      <Spacer />
      <ColorModeToggle />
      <MainSideDrawer />
    </Flex>
  );
}
