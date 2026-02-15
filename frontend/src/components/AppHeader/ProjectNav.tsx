import * as Menubar from "@radix-ui/react-menubar";
import { usePluginTopNavBarItems } from "plugins/runtime";
import { type ReactNode, useState } from "react";
import { useParams } from "react-router-dom";
import { addTemporaryNotification } from "state/actions/notifications";
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
  const isDeploymentMode = useShareSession((x) => x.isDeploymentMode);
  const { canRun } = useShareCapabilities();

  let content: ReactNode = null;
  if (isDeploymentMode) {
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

  return (
    <div className="ml-2 flex items-center gap-1">
      {content}
      <PluginTopNavBarItems />
    </div>
  );
}

function PluginTopNavBarItems() {
  const items = usePluginTopNavBarItems();
  const [busyItemKey, setBusyItemKey] = useState<string | null>(null);
  if (items.length === 0) {
    return null;
  }

  async function onItemClick(
    pluginId: string,
    itemId: string,
    onClick: () => void | Promise<void>,
  ) {
    const itemKey = `${pluginId}:${itemId}`;
    setBusyItemKey(itemKey);
    try {
      await Promise.resolve(onClick());
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : `Top nav action failed for ${pluginId}:${itemId}.`;
      addTemporaryNotification(message, "error");
    } finally {
      setBusyItemKey(null);
    }
  }

  return (
    <div className="ml-1 flex items-center gap-1">
      {items.map((item) => {
        const itemKey = `${item.pluginId}:${item.id}`;
        return (
          <button
            key={itemKey}
            type="button"
            className="rounded border border-setta-300 px-2 py-1 text-[11px] font-medium text-setta-700 hover:bg-setta-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-setta-700 dark:text-setta-200 dark:hover:bg-setta-800"
            onClick={() => {
              void onItemClick(item.pluginId, item.id, item.onClick);
            }}
            title={item.description}
            disabled={busyItemKey === itemKey}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
