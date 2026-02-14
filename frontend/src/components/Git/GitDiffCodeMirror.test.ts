import { describe, expect, it } from "vitest";

import {
  classifyDiffLine,
  parserForPath,
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

describe("parserForPath", () => {
  it("resolves JSON and YAML parser implementations from file extensions", () => {
    const jsonParser = parserForPath("configs/app-config.json");
    const yamlParser = parserForPath("configs/app-config.yaml");
    const ymlParser = parserForPath("configs/app-config.yml");

    expect(jsonParser).not.toBeNull();
    expect(yamlParser).not.toBeNull();
    expect(ymlParser).not.toBeNull();
    expect(yamlParser).toBe(ymlParser);
    expect(jsonParser).not.toBe(yamlParser);
  });

  it("returns null for unsupported file extensions", () => {
    expect(parserForPath("configs/app-config.txt")).toBeNull();
  });
});
