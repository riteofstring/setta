import { describe, expect, it } from "vitest";

import { buildCreateProjectStarterPrompt } from "./projectChatStarterPrompts";

describe("projectChatStarterPrompts", () => {
  it("builds the codebase-first create-project starter prompt", () => {
    const prompt = buildCreateProjectStarterPrompt(true);

    expect(prompt).toContain(
      "Assume this workspace already contains a real codebase",
    );
    expect(prompt).toContain("ask me 8-12 concise clarifying questions");
    expect(prompt).toContain(
      "run error checks and report pass/fail explicitly",
    );
  });

  it("builds the no-codebase create-project starter prompt", () => {
    const prompt = buildCreateProjectStarterPrompt(false);

    expect(prompt).toContain("No existing codebase was detected");
    expect(prompt).toContain("ask me 8-12 concise clarifying questions");
    expect(prompt).toContain(
      "run error checks and report pass/fail explicitly",
    );
  });
});
