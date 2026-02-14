import { describe, expect, it } from "vitest";
import {
  CREATE_PROJECT_STARTER_PROMPT,
  getSlashCommandSuggestions,
  parseSlashCommand,
} from "./chatComposerControls";

describe("chatComposerControls", () => {
  it("parses slash commands with args", () => {
    const parsed = parseSlashCommand("/permissions yolo");

    expect(parsed).not.toBeNull();
    expect(parsed?.command).toBe("/permissions");
    expect(parsed?.action).toBe("permissions");
    expect(parsed?.args).toEqual(["yolo"]);
  });

  it("parses slash commands case-insensitively", () => {
    const parsed = parseSlashCommand(" /Resume latest ");

    expect(parsed).not.toBeNull();
    expect(parsed?.command).toBe("/resume");
    expect(parsed?.args).toEqual(["latest"]);
  });

  it("returns null for unsupported slash commands", () => {
    const parsed = parseSlashCommand("/unknown");

    expect(parsed).toBeNull();
  });

  it("returns command suggestions for slash prefixes", () => {
    const suggestions = getSlashCommandSuggestions("/m");

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]?.command).toBe("/model");
  });

  it("returns no suggestions for multiline input", () => {
    const suggestions = getSlashCommandSuggestions("/m\nother");

    expect(suggestions).toEqual([]);
  });

  it("keeps create-project starter prompt completion guard language", () => {
    expect(CREATE_PROJECT_STARTER_PROMPT).toContain(
      "run error checks and report pass/fail explicitly",
    );
  });
});
