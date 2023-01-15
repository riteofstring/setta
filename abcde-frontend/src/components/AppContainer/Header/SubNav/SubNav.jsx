import { useAuth } from "models/auth";
import VerticalLine from "utils/atoms/dividers/VerticalLine";
import ClearHistoryButton from "./ClearHistoryButton/ClearHistoryButton";
import CreateGroupButton from "./CreateGroupButton/CreateGroupButton";
import CreateSectionButton from "./CreateSectionButton/CreateSectionButton";
import FileMenu from "./FileMenu/FileMenu";
import { ProjectName } from "./ProjectName/ProjectName";
import RunButton from "./RunButton/RunButton";

export default function SubNav() {
  return (
    <div className="flex ml-4 space-x-2">
      <VerticalLine />
      {/* <NavSwitch /> */}
    </div>
  );
}

function NavSwitch() {
  const isAuthenticated = useAuth((x) => x.isAuthenticated);
  return isAuthenticated ? <UiEditorSubNav /> : null;
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
