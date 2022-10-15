import { Button } from "@chakra-ui/react";
import { useStoreActions, useStoreState } from "easy-peasy";
import { LOGIN, SIGN_UP, UI } from "utils/pageNames";

import ClearHistoryButton from "./ClearHistoryButton/ClearHistoryButton";
import CreateGroupButton from "./CreateGroupButton/CreateGroupButton";
import CreateSectionButton from "./CreateSectionButton/CreateSectionButton";
import FileMenu from "./FileMenu/FileMenu";
import RunButton from "./RunButton/RunButton";
import UiConfigButton from "./UiConfigButton/UiConfigButton";

export default function SubNav() {
  return (
    <div className="flex space-x-2">
      <VerticalDivider />
      <NavSwitch />
    </div>
  );
}

function NavSwitch() {
  const isAuthenticated = useStoreState((x) => x.auth.isAuthenticated);
  const currPage = useStoreState((x) => x.currPage.name);
  const setCurrPage = useStoreActions((x) => x.currPage.setName);

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
      {/* <EcoSysButton /> */}
      <ClearHistoryButton />
      <VerticalDivider />
      <CreateSectionButton />
      <CreateGroupButton />
      <UiConfigButton />
      <VerticalDivider />

      <RunButton />
    </>
  );
}

function HomePageSubNav() {
  return <>{/* <HomeButton /> */}</>;
}

function LoggedOutNav({ setCurrPage }) {
  return (
    <>
      <Button onClick={() => setCurrPage(LOGIN)}>Login</Button>
      <Button onClick={() => setCurrPage(SIGN_UP)}>Sign Up</Button>
    </>
  );
}

function VerticalDivider() {
  return <div className="border-r border-gray-200" />;
}
