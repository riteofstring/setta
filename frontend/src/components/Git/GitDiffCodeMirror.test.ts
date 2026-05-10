import { describe, expect, it } from "vitest";

import {
  analyzeDiffLine,
  parserForPath,
  shouldSyntaxHighlightLine,
} from "./gitDiffCodeMirrorUtils";

describe("analyzeDiffLine", () => {
  it("classifies diff structural lines with stable classes", () => {
    expect(analyzeDiffLine("diff --git a/a.txt b/a.txt").lineClass).toBe(
      "cm-gitdiff-meta",
    );
    expect(analyzeDiffLine("@@ -1,2 +1,3 @@").lineClass).toBe(
      "cm-gitdiff-hunk",
    );
    expect(analyzeDiffLine("--- a/a.txt").lineClass).toBe("cm-gitdiff-file");
    expect(analyzeDiffLine("+++ b/a.txt").lineClass).toBe("cm-gitdiff-file");
    expect(analyzeDiffLine("+added").lineClass).toBe("cm-gitdiff-add");
    expect(analyzeDiffLine("-removed").lineClass).toBe("cm-gitdiff-del");
  });

  it("returns null for non-diff content lines", () => {
    expect(analyzeDiffLine(" unchanged").lineClass).toBeNull();
    expect(analyzeDiffLine("").lineClass).toBeNull();
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
  it("resolves JSON, YAML, and TOML parser implementations from file extensions", () => {
    const jsonParser = parserForPath("configs/app-config.json");
    const yamlParser = parserForPath("configs/app-config.yaml");
    const ymlParser = parserForPath("configs/app-config.yml");
    const tomlParser = parserForPath("configs/app-config.toml");

    expect(jsonParser).not.toBeNull();
    expect(yamlParser).not.toBeNull();
    expect(ymlParser).not.toBeNull();
    expect(tomlParser).not.toBeNull();
    expect(yamlParser).toBe(ymlParser);
    expect(jsonParser).not.toBe(yamlParser);
  });

  it("returns null for unsupported file extensions", () => {
    expect(parserForPath("configs/app-config.txt")).toBeNull();
  });
});
