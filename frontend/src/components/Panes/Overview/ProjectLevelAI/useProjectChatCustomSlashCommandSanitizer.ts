import { useEffect } from "react";
import { addTemporaryNotification } from "state/actions/notifications";
import {
  type ProjectChatCustomSlashCommand,
  useLocalStorage,
} from "state/definitions";
import { areProjectChatCustomSlashCommandsEqual } from "./projectChatSlashCommandResolver";

type UseProjectChatCustomSlashCommandSanitizerArgs = {
  projectConfigId: string;
  customProjectChatSlashCommands: ProjectChatCustomSlashCommand[];
  sanitizedCustomSlashCommands: ProjectChatCustomSlashCommand[];
  conflictedCustomSlashCommands: string[];
};

export function useProjectChatCustomSlashCommandSanitizer(
  args: UseProjectChatCustomSlashCommandSanitizerArgs,
): void {
  const {
    projectConfigId,
    customProjectChatSlashCommands,
    sanitizedCustomSlashCommands,
    conflictedCustomSlashCommands,
  } = args;

  useEffect(() => {
    if (
      areProjectChatCustomSlashCommandsEqual(
        customProjectChatSlashCommands,
        sanitizedCustomSlashCommands,
      )
    ) {
      return;
    }

    let stateChanged = false;
    useLocalStorage.setState((state) => {
      const currentByProject =
        state.customProjectChatSlashCommandsByProjectConfigId;
      const currentCommands = currentByProject[projectConfigId] ?? [];
      if (
        areProjectChatCustomSlashCommandsEqual(
          currentCommands,
          sanitizedCustomSlashCommands,
        )
      ) {
        return state;
      }
      const nextByProject = { ...currentByProject };
      if (sanitizedCustomSlashCommands.length === 0) {
        delete nextByProject[projectConfigId];
      } else {
        nextByProject[projectConfigId] = sanitizedCustomSlashCommands;
      }
      stateChanged = true;
      return {
        customProjectChatSlashCommandsByProjectConfigId: nextByProject,
      };
    });

    if (!stateChanged || conflictedCustomSlashCommands.length === 0) {
      return;
    }
    const sortedConflicts = [...conflictedCustomSlashCommands].sort();
    addTemporaryNotification(
      `Removed conflicting custom slash command${sortedConflicts.length === 1 ? "" : "s"}: ${sortedConflicts.join(", ")}.`,
    );
  }, [
    conflictedCustomSlashCommands,
    customProjectChatSlashCommands,
    projectConfigId,
    sanitizedCustomSlashCommands,
  ]);
}
