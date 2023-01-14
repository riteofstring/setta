import { useAuth } from "models/auth";
import { useCurrPage } from "models/currPage";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import VerticalLine from "utils/atoms/dividers/VerticalLine";
import { LOGIN, SIGN_UP, UI } from "utils/pageNames";
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
      <NavSwitch />
    </div>
  );
}

function NavSwitch() {
  const isAuthenticated = useAuth((x) => x.isAuthenticated);
  const currPage = useCurrPage((x) => x.name);
  const setCurrPage = useCurrPage((x) => x.setName);

  if (isAuthenticated) {
    switch (currPage) {
      case UI:
        return <UiEditorSubNav />;
    }
  } else {
    return <LoggedOutNav setCurrPage={setCurrPage} />;
  }
  return <></>;
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

function LoggedOutNav({ setCurrPage }) {
  return (
    <>
      <MenuBarButton onClick={() => setCurrPage(LOGIN)}>Login</MenuBarButton>
      <MenuBarButton onClick={() => setCurrPage(SIGN_UP)}>
        Sign Up
      </MenuBarButton>
    </>
  );
}
