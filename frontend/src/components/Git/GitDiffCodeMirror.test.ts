import { describe, expect, it } from "vitest";

import {
  classifyDiffLine,
  shouldSyntaxHighlightLine,
} from "./GitDiffCodeMirror";

describe("classifyDiffLine", () => {
  it("classifies diff structural lines with stable classes", () => {
    expect(classifyDiffLine("diff --git a/a.txt b/a.txt")).toBe(
      "cm-gitdiff-meta",
    );
    expect(classifyDiffLine("@@ -1,2 +1,3 @@")).toBe("cm-gitdiff-hunk");
    expect(classifyDiffLine("--- a/a.txt")).toBe("cm-gitdiff-file");
    expect(classifyDiffLine("+++ b/a.txt")).toBe("cm-gitdiff-file");
    expect(classifyDiffLine("+added")).toBe("cm-gitdiff-add");
    expect(classifyDiffLine("-removed")).toBe("cm-gitdiff-del");
  });

  it("returns null for non-diff content lines", () => {
    expect(classifyDiffLine(" unchanged")).toBeNull();
    expect(classifyDiffLine("")).toBeNull();
  });
});

describe("shouldSyntaxHighlightLine", () => {
  it("highlights only code-bearing context/add/del lines", () => {
    expect(shouldSyntaxHighlightLine(" context")).toBe(true);
    expect(shouldSyntaxHighlightLine("+added")).toBe(true);
    expect(shouldSyntaxHighlightLine("-removed")).toBe(true);
  });

  it("skips syntax highlighting for metadata and hunk headers", () => {
    expect(shouldSyntaxHighlightLine("@@ -1 +1 @@")).toBe(false);
    expect(shouldSyntaxHighlightLine("diff --git a/a.txt b/a.txt")).toBe(false);
    expect(shouldSyntaxHighlightLine("index 111..222 100644")).toBe(false);
    expect(shouldSyntaxHighlightLine("--- a/a.txt")).toBe(false);
    expect(shouldSyntaxHighlightLine("+++ b/a.txt")).toBe(false);
  });
});
