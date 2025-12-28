import * as Menubar from "@radix-ui/react-menubar";
import { useParams } from "react-router-dom";
import { useShareSession } from "state/definitions";
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
  const { isShareMode, sharePolicy } = useShareSession((x) => ({
    isShareMode: x.isShareMode,
    sharePolicy: x.sharePolicy,
  }));
  const allowRun = sharePolicy?.allowRun ?? true;

  return (
    <div className="ml-4 flex gap-1">
      {isShareMode ? (
        <>
          <Menubar.Root className="contents">
            <WebsocketConnections />
            {allowRun && <RunButton />}
          </Menubar.Root>
          {allowRun && <StopButton />}
        </>
      ) : projectConfigName ? (
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
      ) : (
        <Menubar.Root className="contents">
          <WebsocketConnections />
        </Menubar.Root>
      )}
    </div>
  );
}
