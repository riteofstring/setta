import { HamburgerIcon } from "@chakra-ui/icons";
import { VStack, Button } from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { useHistory } from "react-router-dom";
import DrawerContainer from "utils/DrawerContainer/DrawerContainer";

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
  return <></>;
}

function Body() {
  let history = useHistory();

  const saveDraftUI = useStoreActions((actions) => actions.uiInfo.saveDraftUI);
  const token = useStoreState((state) => state.auth.token);

  const goToLogout = () => {
    history.push("/logout");
  };

  const saveDraft = () => {
    saveDraftUI({ token }).then(() => null);
  };

  return (
    <VStack align="stretch">
      <Button>Profile</Button>
      <Button>Settings</Button>
      <Button variant="outline" onClick={saveDraft}>
        Save Draft
      </Button>
      <Button variant="outline" onClick={goToLogout}>
        Logout
      </Button>
    </VStack>
  );
}

function Footer() {
  return <></>;
}
