import * as Menubar from "@radix-ui/react-menubar";
import { useParams } from "react-router-dom";
import { CommunityButton } from "./CommunityButton/CommunityButton";
import { EditMenu } from "./EditMenu/EditMenu";
import { FileMenu } from "./FileMenu/FileMenu";
import { RunButton } from "./RunButton/RunButton";
import { TypeCheckButton } from "./TypeCheckButton/TypeCheckButton";
import { WebsocketConnections } from "./WebsocketConnections/WebsocketConnections";

export function SubNav() {
  return (
    <nav className="flex space-x-2">
      <NavSwitch />
    </nav>
  );
}

function NavSwitch() {
  const { projectName, configName } = useParams();

  return projectName && configName ? <UiEditorSubNav /> : null;
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
      {/* <StateCounter /> */}
      <WebsocketConnections />
      <TypeCheckButton />
    </div>
  );
}
