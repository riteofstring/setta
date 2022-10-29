import { HamburgerIcon } from "@chakra-ui/icons";
import { Button, VStack } from "@chakra-ui/react";
import { logout } from "dbRequests/authentication";
import { useStoreActions, useStoreState } from "easy-peasy";
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
  const saveDraftUI = useStoreActions((x) => x.uiInfo.saveDraftUI);
  const access_token = useStoreState((x) => x.auth.access_token);
  const actionLoginFail = useStoreActions((x) => x.auth.loginFail);

  const doLogout = () => {
    logout({ actionLoginFail, access_token });
    resetEntireState();
  };

  const saveDraft = () => {
    saveDraftUI({ access_token }).then(() => null);
  };

  return (
    <VStack align="stretch">
      <Button>Profile</Button>
      <Button>Settings</Button>
      <Button variant="outline" onClick={saveDraft}>
        Save Draft
      </Button>
      <Button variant="outline" onClick={doLogout}>
        Logout
      </Button>
    </VStack>
  );
}

function Footer() {
  return <></>;
}
