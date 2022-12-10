import { resetAllSlices } from "models/utils";
import { FiMenu } from "react-icons/fi";
import { logout } from "thunks/authentication";
import StandardButton from "utils/atoms/buttons/StandardButton";
import DrawerContainer from "utils/DrawerContainer/DrawerContainer";

export default function MainSideDrawer() {
  return (
    <div className="flex flex-1 justify-end content-center">
      <DrawerContainer
        header={<Header />}
        body={<Body />}
        footer={<Footer />}
        icon={<FiMenu />}
      />
    </div>
  );
}

function Header() {
  return <></>;
}

function Body() {
  const doLogout = () => {
    logout();
    resetAllSlices();
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
