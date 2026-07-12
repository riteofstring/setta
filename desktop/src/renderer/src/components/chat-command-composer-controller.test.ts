import type { ChatCommandDescriptor } from "@generated/backend";
import { describe, expect, test } from "vitest";

import {
  commandFreeTextArgumentValue,
  commandComposerState,
  commandTextToExecuteFromState,
  completionForCommandState,
} from "./chat-command-composer-controller";

describe("commandComposerState", () => {
  test("discovers all slash commands for a bare marker", () => {
    const state = commandComposerState("/", descriptors());

    expect(state.phase).toBe("command_name");
    expect(state.suggestions.map((suggestion) => suggestion.label)).toEqual(["/goal"]);
    expect(state.highlights.map((span) => span.kind)).toEqual(["marker"]);
  });

  test("narrows command names and completes selected commands", () => {
    const state = commandComposerState("/g", descriptors());

    expect(state.suggestions.map((suggestion) => suggestion.label)).toEqual(["/goal"]);
    expect(completionForCommandState(state, 0)?.value).toBe("/goal ");
    expect(commandTextToExecuteFromState(state, 0)).toBe("/goal");
  });

  test("preserves arguments when completing a partial command name", () => {
    const state = commandComposerState("/g finish renderer tests", descriptors());

    expect(commandTextToExecuteFromState(state, 0)).toBe("/goal finish renderer tests");
  });

  test("exposes literal argument suggestions for goal", () => {
    const state = commandComposerState("/goal ", descriptors());

    expect(state.phase).toBe("command_arguments");
    expect(state.suggestions.map((suggestion) => suggestion.label)).toEqual([
      "edit",
      "clear",
      "pause",
      "resume",
    ]);
    expect(completionForCommandState(state, 0)?.value).toBe("/goal edit");
  });

  test("highlights exact literal and free text goal arguments separately", () => {
    const literal = commandComposerState("/goal edit", descriptors());
    const freeText = commandComposerState("/goal finish renderer tests", descriptors());
    const literalPrefix = commandComposerState("/goal e", descriptors());
    const literalWithText = commandComposerState("/goal clear the cache", descriptors());

    expect(literal.highlights.map((span) => [span.text, span.kind])).toContainEqual([
      "edit",
      "literal",
    ]);
    expect(freeText.highlights.map((span) => [span.text, span.kind])).toContainEqual([
      "finish renderer tests",
      "free_text",
    ]);
    expect(literalPrefix.suggestions).toEqual([]);
    expect(literalPrefix.highlights.map((span) => [span.text, span.kind])).toContainEqual([
      "e",
      "free_text",
    ]);
    expect(literalWithText.highlights.map((span) => [span.text, span.kind])).toContainEqual([
      "clear the cache",
      "free_text",
    ]);
    expect(commandTextToExecuteFromState(literalPrefix, 0)).toBe("/goal e");
    expect(commandTextToExecuteFromState(literalWithText, 0)).toBe("/goal clear the cache");
  });

  test("derives free text arguments from descriptor grammar without command mirrors", () => {
    expect(
      commandFreeTextArgumentValue(commandComposerState("/goal edit", descriptors())),
    ).toBeNull();
    expect(commandFreeTextArgumentValue(commandComposerState("/goal e", descriptors()))).toBe("e");
    expect(
      commandFreeTextArgumentValue(commandComposerState("/goal clear the cache", descriptors())),
    ).toBe("clear the cache");
  });

  test("marks unknown commands invalid without hiding backend execution text", () => {
    const state = commandComposerState("/wat", descriptors());

    expect(state.phase).toBe("invalid");
    expect(state.invalidReason).toContain("Unknown slash command");
    expect(commandTextToExecuteFromState(state, 0)).toBe("/wat");
  });
});

function descriptors(): ChatCommandDescriptor[] {
  return [
    {
      available: true,
      description: "Show, edit, set, pause, resume, or clear the active goal.",
      grammar: {
        arguments: [
          { description: "Open the goal editor.", kind: "literal", token: "edit" },
          { description: "Clear the active goal.", kind: "literal", token: "clear" },
          { description: "Pause the active goal.", kind: "literal", token: "pause" },
          { description: "Resume the active goal.", kind: "literal", token: "resume" },
          {
            description: "Set or replace the active goal objective.",
            kind: "free_text",
            maxRunes: 4000,
            name: "objective",
            required: false,
          },
        ],
        literalMatch: "exact",
        summary: "/goal [objective|edit|clear|pause|resume]",
      },
      kind: "goal",
      name: "/goal",
      unavailableReason: "",
    },
  ];
}
