import { HamburgerIcon } from "@chakra-ui/icons";
import { useStoreActions } from "easy-peasy";
import { resetEntireState } from "store/store";
import StandardButton from "utils/atoms/buttons/StandardButton";
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
    <div className="flex flex-col gap-1">
      <StandardButton>Profile</StandardButton>
      <StandardButton>Settings</StandardButton>
      <StandardButton variant="outline" onClick={doLogout}>
        Logout
      </StandardButton>
    </div>
  );
}

function Footer() {
  return <></>;
}
