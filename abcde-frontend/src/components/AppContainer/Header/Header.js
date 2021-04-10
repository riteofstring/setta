import { Flex, Heading, Box, Spacer } from "@chakra-ui/react";
import TabNav from "./Tabs/TabNav";
import ColorModeToggle from "./ColorModeToggle/ColorModeToggle";
import { useHistory } from "react-router-dom";
import { useStoreActions, useStoreState } from "easy-peasy";
import MainSideDrawer from "./MainSideDrawer/MainSideDrawer";

export default function HeaderContainer() {
  let history = useHistory();

  const saveDraftUI = useStoreActions((actions) => actions.uiInfo.saveDraftUI);
  const token = useStoreState((state) => state.auth.token);

  const goToLogout = () => {
    saveDraftUI({ token }).then((res) => history.push("/logout"));
  };

  return (
    <Flex width="calc(90vw)" height="2.5rem" mt="1rem" align="center">
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

      <MainSideDrawer />
    </Flex>
  );
}
