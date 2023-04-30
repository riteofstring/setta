import * as Menubar from "@radix-ui/react-menubar";
import { useAuth } from "models/auth";
import { useParams } from "react-router-dom";
import { CommunityButton } from "./CommunityButton/CommunityButton";
import { EditMenu } from "./EditMenu/EditMenu";
import { FileMenu } from "./FileMenu/FileMenu";
import { RunButton } from "./RunButton/RunButton";
import { ZundoTest } from "./ZundoTest/ZundoTest";

export function SubNav() {
  return (
    <div className="flex space-x-2">
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
    <div className="ml-4 flex gap-1">
      <Menubar.Root className="contents">
        <FileMenu />
        <EditMenu />
      </Menubar.Root>
      <CommunityButton />
      <RunButton />
      <ZundoTest />
    </div>
  );
}
