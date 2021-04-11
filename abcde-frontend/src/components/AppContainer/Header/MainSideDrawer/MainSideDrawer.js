import {
  Flex,
  Heading,
  Box,
  VStack,
  Spacer,
  IconButton,
  Button,
} from "@chakra-ui/react";
import { HamburgerIcon } from "@chakra-ui/icons";
import { useHistory } from "react-router-dom";
import { useStoreActions, useStoreState } from "easy-peasy";
import DrawerContainer from "../../../../utils/DrawerContainer/DrawerContainer";

export default function HeaderContainer() {
  return (
    <DrawerContainer
      header={<Header />}
      body={<Body />}
      footer={<Footer />}
      icon={<HamburgerIcon />}
      size="sm"
      borderRadius="full"
      variant="ghost"
    />
  );
}

function Header() {
  return <Box>Header</Box>;
}

function Body() {
  let history = useHistory();

  const saveDraftUI = useStoreActions((actions) => actions.uiInfo.saveDraftUI);
  const token = useStoreState((state) => state.auth.token);

  const goToLogout = () => {
    saveDraftUI({ token }).then((res) => history.push("/logout"));
  };
  return (
    <VStack align="stretch">
      <Button variant="outline" onClick={goToLogout}>
        Logout
      </Button>
    </VStack>
  );
}

function Footer() {
  return <Box>Footer</Box>;
}
