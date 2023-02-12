import { useAuth } from "models/auth";
import { useLocation, useParams } from "react-router-dom";
import { VerticalLine } from "utils/atoms/dividers/VerticalLine";
import { CommunityButton } from "./CommunityButton/CommunityButton";
import { CreateGroupButton } from "./CreateGroupButton/CreateGroupButton";
import { CreateSectionButton } from "./CreateSectionButton/CreateSectionButton";
import { FileMenu } from "./FileMenu/FileMenu";
import { ProjectName } from "./ProjectName/ProjectName";
import { RunButton } from "./RunButton/RunButton";

export function SubNav() {
  return (
    <div className="ml-4 flex space-x-2">
      <VerticalLine />
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
      <FileMenu />
      {/* <BackToProject /> */}
      <CommunityButton />
      <VerticalLine />
      <CreateSectionButton />
      <CreateGroupButton />
      <VerticalLine />

      <RunButton />
      <ProjectName />
    </>
  );
}
