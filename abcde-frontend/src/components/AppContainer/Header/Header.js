import { Flex, Heading, Box, Spacer, IconButton } from "@chakra-ui/react";
import { HamburgerIcon } from "@chakra-ui/icons";
import TabNav from "./Tabs/TabNav";
import ColorModeToggle from "./ColorModeToggle/ColorModeToggle";

export default function HeaderContainer() {
  return (
    <Flex width="calc(90vw - 3rem)" height="2.5rem" mt="1rem" align="center">
      <Heading
        fontSize="md"
        fontWeight="normal"
        letterSpacing="widest"
        color="gray.900"
        mr="1rem"
      >
        ABCDE
      </Heading>
      <Box height="100%" width="100%">
        <TabNav />
      </Box>
      <Spacer />
      <ColorModeToggle />
      <IconButton icon={<HamburgerIcon />} size="sm" bg="whiteAlpha" />
    </Flex>
  );
}
