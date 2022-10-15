import { Flex, Heading, Link, Spacer, Text } from "@chakra-ui/react";
import "@fontsource/jetbrains-mono/300.css";
import { useStoreActions } from "easy-peasy";
import { HOME } from "utils/pageNames";
import ColorModeToggle from "./ColorModeToggle/ColorModeToggle";
import MainSideDrawer from "./MainSideDrawer/MainSideDrawer";
import SubNav from "./SubNav/SubNav";

export default function HeaderContainer() {
  const setCurrPage = useStoreActions((x) => x.currPage.setName);
  return (
    <Flex width="calc(100vw - 5rem)" height="4rem" align="center">
      <Link
        variant="ghost"
        _hover={{ textDecoration: "none" }}
        onClick={() => setCurrPage(HOME)}
      >
        <Heading
          fontSize="xl"
          letterSpacing="-1px"
          color="gray.600"
          mr="1rem"
          fontFamily="JetBrains Mono"
        >
          <Text as="span" color="#00B5D8">
            run
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
