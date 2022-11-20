import { HamburgerIcon } from "@chakra-ui/icons";
import { Button, VStack } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { resetEntireState } from "store/store";
import DrawerContainer from "utils/DrawerContainer/DrawerContainer";

export default function MainSideDrawer() {
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
  return <></>;
}

function Body() {
  const logout = useStoreActions((x) => x.thunks.logout);

  const doLogout = () => {
    logout();
    resetEntireState();
  };

  return (
    <VStack align="stretch">
      <Button>Profile</Button>
      <Button>Settings</Button>
      <Button variant="outline" onClick={doLogout}>
        Logout
      </Button>
    </VStack>
  );
}

function Footer() {
  return <></>;
}
