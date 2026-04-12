import { describe, expect, it } from "vitest";

import { gitDiffCodeMirrorTestApi } from "./GitDiffCodeMirror";

describe("gitDiffCodeMirrorTestApi.classifyDiffLine", () => {
  it("classifies diff structural lines with stable classes", () => {
    expect(
      gitDiffCodeMirrorTestApi.classifyDiffLine("diff --git a/a.txt b/a.txt"),
    ).toBe("cm-gitdiff-meta");
    expect(
      gitDiffCodeMirrorTestApi.classifyDiffLine("@@ -1,2 +1,3 @@"),
    ).toBe("cm-gitdiff-hunk");
    expect(gitDiffCodeMirrorTestApi.classifyDiffLine("--- a/a.txt")).toBe(
      "cm-gitdiff-file",
    );
    expect(gitDiffCodeMirrorTestApi.classifyDiffLine("+++ b/a.txt")).toBe(
      "cm-gitdiff-file",
    );
    expect(gitDiffCodeMirrorTestApi.classifyDiffLine("+added")).toBe(
      "cm-gitdiff-add",
    );
    expect(gitDiffCodeMirrorTestApi.classifyDiffLine("-removed")).toBe(
      "cm-gitdiff-del",
    );
  });

  it("returns null for non-diff content lines", () => {
    expect(gitDiffCodeMirrorTestApi.classifyDiffLine(" unchanged")).toBeNull();
    expect(gitDiffCodeMirrorTestApi.classifyDiffLine("")).toBeNull();
  });
});

describe("gitDiffCodeMirrorTestApi.shouldSyntaxHighlightLine", () => {
  it("highlights only code-bearing context/add/del lines", () => {
    expect(gitDiffCodeMirrorTestApi.shouldSyntaxHighlightLine(" context")).toBe(
      true,
    );
    expect(gitDiffCodeMirrorTestApi.shouldSyntaxHighlightLine("+added")).toBe(
      true,
    );
    expect(gitDiffCodeMirrorTestApi.shouldSyntaxHighlightLine("-removed")).toBe(
      true,
    );
  });

  it("skips syntax highlighting for metadata and hunk headers", () => {
    expect(
      gitDiffCodeMirrorTestApi.shouldSyntaxHighlightLine("@@ -1 +1 @@"),
    ).toBe(false);
    expect(
      gitDiffCodeMirrorTestApi.shouldSyntaxHighlightLine(
        "diff --git a/a.txt b/a.txt",
      ),
    ).toBe(false);
    expect(
      gitDiffCodeMirrorTestApi.shouldSyntaxHighlightLine(
        "index 111..222 100644",
      ),
    ).toBe(false);
    expect(
      gitDiffCodeMirrorTestApi.shouldSyntaxHighlightLine("--- a/a.txt"),
    ).toBe(false);
    expect(
      gitDiffCodeMirrorTestApi.shouldSyntaxHighlightLine("+++ b/a.txt"),
    ).toBe(false);
  });
});

describe("gitDiffCodeMirrorTestApi.parserForPath", () => {
  it("resolves JSON, YAML, and TOML parser implementations from file extensions", () => {
    const jsonParser = gitDiffCodeMirrorTestApi.parserForPath(
      "configs/app-config.json",
    );
    const yamlParser = gitDiffCodeMirrorTestApi.parserForPath(
      "configs/app-config.yaml",
    );
    const ymlParser = gitDiffCodeMirrorTestApi.parserForPath(
      "configs/app-config.yml",
    );
    const tomlParser = gitDiffCodeMirrorTestApi.parserForPath(
      "configs/app-config.toml",
    );

    expect(jsonParser).not.toBeNull();
    expect(yamlParser).not.toBeNull();
    expect(ymlParser).not.toBeNull();
    expect(tomlParser).not.toBeNull();
    expect(yamlParser).toBe(ymlParser);
    expect(jsonParser).not.toBe(yamlParser);
  });

  it("returns null for unsupported file extensions", () => {
    expect(
      gitDiffCodeMirrorTestApi.parserForPath("configs/app-config.txt"),
    ).toBeNull();
  });
});
