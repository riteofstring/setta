import * as Menubar from "@radix-ui/react-menubar";
import { useParams } from "react-router-dom";
import { useShareSession } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { EditMenu } from "./EditMenu";
import { FileMenu } from "./FileMenu";
import { FollowAIToggleButton } from "./FollowAIToggleButton";
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
          <FollowAIToggleButton />
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

  return <div className="ml-4 flex gap-1">{content}</div>;
}
