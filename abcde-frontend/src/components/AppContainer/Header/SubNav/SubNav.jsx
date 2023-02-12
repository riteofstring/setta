import { useAuth } from "models/auth";
import { useParams } from "react-router-dom";
import { VerticalLine } from "utils/atoms/dividers/VerticalLine";
import { ClearHistoryButton } from "./ClearHistoryButton/ClearHistoryButton";
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
      <ClearHistoryButton />
      <VerticalLine />
      <CreateSectionButton />
      <CreateGroupButton />
      <VerticalLine />

      <RunButton />
      <ProjectName />
    </>
  );
}
