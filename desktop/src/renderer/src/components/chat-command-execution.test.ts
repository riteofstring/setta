import type { ChatCommandDescriptor, ChatGoalState } from "@generated/backend";
import { describe, expect, test, vi } from "vitest";

import { commandComposerState } from "./chat-command-composer-controller";
import {
  commandTextToExecute,
  goalReplacementExecutionOptions,
  slashCommandExecutionPlan,
} from "./chat-command-execution";

describe("slash command execution planning", () => {
  test("enters selected command only when the draft is the command token", () => {
    const commands = [commandDescriptor()];

    expect(commandTextToExecute("/g", commands)).toBe("/goal");
    expect(commandTextToExecute("/g finish", commands)).toBe("/goal finish");
    expect(commandTextToExecute("/goal finish", commands)).toBe("/goal finish");
    expect(commandTextToExecute("/unknown", commands)).toBe("/unknown");
  });

  test("loads command descriptors before deriving slash execution", async () => {
    const commands = [commandDescriptor()];
    const confirm = vi.fn(() => true);
    const loadCommands = vi.fn().mockResolvedValue(commands);

    await expect(
      slashCommandExecutionPlan({
        commands: [],
        confirmReplacement: confirm,
        currentGoal: goalState("existing", "active"),
        draft: "/g replacement",
        loadCommands,
        selectedIndex: 0,
        shouldReloadCommands: true,
      }),
    ).resolves.toEqual({
      commandText: "/goal replacement",
      commands,
      options: { confirmGoalReplacement: true },
      pendingGoalObjective: "replacement",
    });
    expect(loadCommands).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith("Replace the current goal?");
  });

  test("marks only goal objective commands as pending goal submissions", async () => {
    const commands = [commandDescriptor()];

    await expect(
      slashCommandExecutionPlan({
        commands,
        confirmReplacement: vi.fn(() => true),
        currentGoal: null,
        draft: "/goal finish renderer tests",
        loadCommands: vi.fn(),
        selectedIndex: 0,
        shouldReloadCommands: false,
      }),
    ).resolves.toMatchObject({
      pendingGoalObjective: "finish renderer tests",
    });
    await expect(
      slashCommandExecutionPlan({
        commands,
        confirmReplacement: vi.fn(() => true),
        currentGoal: null,
        draft: "/goal edit",
        loadCommands: vi.fn(),
        selectedIndex: 0,
        shouldReloadCommands: false,
      }),
    ).resolves.toMatchObject({
      pendingGoalObjective: null,
    });
  });

  test("confirms before replacing a non-terminal goal", () => {
    const confirm = vi.fn(() => true);

    expect(
      goalReplacementExecutionOptions(
        commandComposerState("/goal replacement", [commandDescriptor()]),
        goalState("existing", "active"),
        confirm,
      ),
    ).toEqual({ confirmGoalReplacement: true });
    expect(confirm).toHaveBeenCalledWith("Replace the current goal?");
  });

  test("keeps the draft when replacement is cancelled", () => {
    const confirm = vi.fn(() => false);

    expect(
      goalReplacementExecutionOptions(
        commandComposerState("/goal replacement", [commandDescriptor()]),
        goalState("existing", "paused"),
        confirm,
      ),
    ).toBeNull();
  });

  test("does not confirm same-objective or completed goals", () => {
    const confirm = vi.fn();

    expect(
      goalReplacementExecutionOptions(
        commandComposerState("/goal existing", [commandDescriptor()]),
        goalState("existing", "active"),
        confirm,
      ),
    ).toEqual({});
    expect(
      goalReplacementExecutionOptions(
        commandComposerState("/goal replacement", [commandDescriptor()]),
        goalState("done", "complete"),
        confirm,
      ),
    ).toEqual({});
    expect(confirm).not.toHaveBeenCalled();
  });
});

function commandDescriptor(): ChatCommandDescriptor {
  return {
    available: true,
    description: "/goal",
    grammar: {
      arguments: [
        { description: "Open editor", kind: "literal", token: "edit" },
        {
          description: "Set objective",
          kind: "free_text",
          maxRunes: 4000,
          name: "objective",
          required: false,
        },
      ],
      literalMatch: "exact",
      summary: "/goal [objective|edit]",
    },
    kind: "goal",
    name: "/goal",
    unavailableReason: "",
  };
}

function goalState(objective: string, status: string): ChatGoalState {
  return {
    createdAt: 0,
    objective,
    status,
    threadId: "thread_fake",
    timeUsedSeconds: 0,
    tokenBudget: null,
    tokensUsed: 0,
    updatedAt: 0,
  };
}
