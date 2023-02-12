import { useAuth } from "models/auth";
import { useLocation, useParams } from "react-router-dom";
import { CommunityButton } from "./CommunityButton/CommunityButton";
import { FileMenu } from "./FileMenu/FileMenu";
import { RunButton } from "./RunButton/RunButton";

export function SubNav() {
  return (
    <div className="flex space-x-2">
      {/* <VerticalLine /> */}
      <NavSwitch />
    </div>
  );
}

function NavSwitch() {
  const { pathname } = useLocation();
  const community = pathname === "/community" && true;
  const isAuthenticated = useAuth((x) => x.isAuthenticated);
  const { username, projectName, configName } = useParams();

  return isAuthenticated && username && projectName && configName ? (
    <UiEditorSubNav />
  ) : null;
}

function UiEditorSubNav() {
  return (
    <>
      {/* <VerticalLine /> */}
      <FileMenu />
      {/* <BackToProject /> */}
      <CommunityButton />

      {/* <CreateSectionButton />
      <CreateGroupButton /> */}
      <RunButton />
    </>
  );
}
