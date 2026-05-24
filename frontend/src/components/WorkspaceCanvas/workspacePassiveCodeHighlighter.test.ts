import { describe, expect, it } from "vitest";
import {
  highlightWorkspaceCodePreview,
  WORKSPACE_PASSIVE_CODE_HIGHLIGHTER_REVISION,
} from "./workspacePassiveCodeHighlighter";

describe("workspace passive code highlighter", () => {
  it("uses CodeMirror/Lezer parsers to produce bounded canvas token runs", () => {
    const runs = highlightWorkspaceCodePreview({
      cacheKey: "code-highlight:test",
      code: "def answer():\n    return 42\nprint(answer())",
      language: "python",
      themeId: "dark",
      maxLines: 2,
      maxColumns: 80,
    });

    expect(WORKSPACE_PASSIVE_CODE_HIGHLIGHTER_REVISION).toContain("lezer");
    expect(runs.map((run) => run.text).join("")).toContain("def answer():");
    expect(runs.some((run) => run.line > 1)).toBe(false);
    expect(
      runs.find((run) => run.text === "def" || run.text.includes("return")),
    ).toMatchObject({
      fontWeight: "bold",
    });
  });

  it("falls back to plain rendering when no parser exists", () => {
    const runs = highlightWorkspaceCodePreview({
      cacheKey: "code-highlight:plain",
      code: "echo hello",
      language: "plaintext",
      themeId: "light",
      maxLines: 6,
      maxColumns: 80,
    });

    expect(runs).toEqual([]);
  });
});
