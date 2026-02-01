import * as Menubar from "@radix-ui/react-menubar";
import { useParams } from "react-router-dom";
import { useShareSession } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { EditMenu } from "./EditMenu";
import { FileMenu } from "./FileMenu";
import { RunButton } from "./RunButton";
import { StopButton } from "./StopButton";
import { WebsocketConnections } from "./WebsocketConnections";

export function ProjectNav() {
  return (
    <nav className="flex space-x-2">
      <ProjectNavSwitch />
    </nav>
  );
}

function ProjectNavSwitch() {
  const { projectConfigName } = useParams();
  const isShareMode = useShareSession((x) => x.isShareMode);
  const { canRun } = useShareCapabilities();

  let content = null;
  if (isShareMode) {
    if (canRun) {
      content = (
        <>
          <Menubar.Root className="contents">
            <RunButton />
          </Menubar.Root>
          <StopButton />
        </>
      );
    }
  } else if (projectConfigName) {
    content = (
      <>
        <Menubar.Root className="contents">
          <FileMenu />
          <EditMenu />
          <WebsocketConnections />
          <RunButton />
        </Menubar.Root>
        <StopButton />
      </>
    );
  } else {
    content = (
      <Menubar.Root className="contents">
        <WebsocketConnections />
      </Menubar.Root>
    );
  }

  return <div className="ml-2 flex">{content}</div>;
}
