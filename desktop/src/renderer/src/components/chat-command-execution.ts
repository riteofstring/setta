import type { ChatCommandDescriptor, ChatGoalState } from "@generated/backend";
import type { ChatCommandExecutionOptions } from "@shared/types";

import {
  commandComposerState,
  commandFreeTextArgumentValue,
  commandTextToExecuteFromState,
  type CommandComposerState,
} from "./chat-command-composer-controller";

interface SlashCommandExecutionPlanRequest {
  commands: ChatCommandDescriptor[];
  confirmReplacement: (message: string) => boolean;
  currentGoal: ChatGoalState | null;
  draft: string;
  loadCommands: () => Promise<ChatCommandDescriptor[]>;
  selectedIndex: number;
  shouldReloadCommands: boolean;
}

interface SlashCommandExecutionPlan {
  commandText: string;
  commands: ChatCommandDescriptor[];
  options: ChatCommandExecutionOptions;
}

export async function slashCommandExecutionPlan({
  commands,
  confirmReplacement,
  currentGoal,
  draft,
  loadCommands,
  selectedIndex,
  shouldReloadCommands,
}: SlashCommandExecutionPlanRequest): Promise<SlashCommandExecutionPlan | null> {
  const executionCommands = shouldReloadCommands ? await loadCommands() : commands;
  const commandText = commandTextToExecute(draft, executionCommands, selectedIndex);
  const executionState = commandComposerState(commandText, executionCommands);
  const options = goalReplacementExecutionOptions(executionState, currentGoal, confirmReplacement);
  if (options === null) {
    return null;
  }
  return { commandText, commands: executionCommands, options };
}

export function commandDescriptorsNeedLoad({
  commandListContextKey,
  commandListKey,
  commands,
}: {
  commandListContextKey: string;
  commandListKey: string;
  commands: ChatCommandDescriptor[];
}) {
  return commandListContextKey !== commandListKey || commands.length === 0;
}

export function commandTextToExecute(
  prompt: string,
  commands: ChatCommandDescriptor[],
  selectedIndex = 0,
) {
  return commandTextToExecuteFromState(commandComposerState(prompt, commands), selectedIndex);
}

export function goalReplacementExecutionOptions(
  state: CommandComposerState,
  currentGoal: ChatGoalState | null,
  confirmReplacement: (message: string) => boolean,
): ChatCommandExecutionOptions | null {
  if (state.descriptor?.kind !== "goal") {
    return {};
  }
  const nextObjective = commandFreeTextArgumentValue(state);
  if (!nextObjective || !currentGoal || currentGoal.status === "complete") {
    return {};
  }
  if (currentGoal.objective.trim() === nextObjective.trim()) {
    return {};
  }
  if (!confirmReplacement("Replace the current goal?")) {
    return null;
  }
  return { confirmGoalReplacement: true };
}
