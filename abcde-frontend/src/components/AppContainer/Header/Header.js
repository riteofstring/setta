import { Flex, Heading, Box, Spacer } from "@chakra-ui/react";

import ColorModeToggle from "./ColorModeToggle/ColorModeToggle";
import MainSideDrawer from "./MainSideDrawer/MainSideDrawer";
import TabNav from "./Tabs/TabNav";

export default function HeaderContainer() {
  return (
    <Flex width="calc(100vw - 5rem)" height="4rem" align="center">
      <Heading
        fontSize="sm"
        fontWeight="100"
        letterSpacing="10px"
        color="gray.900"
        mr="1rem"
      >
        ABCDE
      </Heading>
      <Box height="100%" width="100%">
        {/* <TabNav /> */}
      </Box>
      <Spacer />
      <ColorModeToggle />
      <MainSideDrawer />
    </Flex>
  );
}
