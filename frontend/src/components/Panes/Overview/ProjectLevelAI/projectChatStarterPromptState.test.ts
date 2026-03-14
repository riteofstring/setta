import { CHAT_STARTER_PROMPTS } from "components/Chat/chatComposerControls";
import { describe, expect, it } from "vitest";
import { resolveVisibleProjectChatStarterPrompts } from "./projectChatStarterPromptState";

describe("projectChatStarterPromptState", () => {
  it("updates the create-project prompt when no codebase is detected", () => {
    const prompts = resolveVisibleProjectChatStarterPrompts({
      hasPythonInWorkspaceRoot: false,
    });
    const createProjectPrompt = prompts.find(
      (starterPrompt) => starterPrompt.id === "create-project",
    );

    expect(createProjectPrompt?.prompt).toContain(
      "No existing codebase was detected",
    );
  });

  it("preserves the authored starter-prompt set and switches create-project back to the codebase-first copy", () => {
    const promptsWithPython = resolveVisibleProjectChatStarterPrompts({
      hasPythonInWorkspaceRoot: true,
    });
    const createProjectPrompt = promptsWithPython.find(
      (starterPrompt) => starterPrompt.id === "create-project",
    );

    expect(promptsWithPython).toHaveLength(CHAT_STARTER_PROMPTS.length);
    expect(createProjectPrompt?.prompt).toContain(
      "Assume this workspace already contains a real codebase",
    );
  });
});
