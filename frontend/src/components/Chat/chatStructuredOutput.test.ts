import { describe, expect, it } from "vitest";
import {
  classifyDiffLineForChat,
  isUnifiedDiffText,
  resolveStructuredOutputPayload,
} from "./chatStructuredOutput";

describe("chatStructuredOutput", () => {
  it("classifies object payloads as json code output", () => {
    const payload = resolveStructuredOutputPayload({
      value: { ok: true, items: [1, 2, 3] },
      toolName: "mcp__workspace__read_file",
      part: "output",
      contextValue: { path: "config.json" },
    });

    expect(payload).not.toBeNull();
    expect(payload?.kind).toBe("code");
    expect(payload?.language).toBe("json");
    expect(payload?.text).toContain('"ok": true');
    expect(payload?.text).toContain('"items": [');
  });

  it("classifies unified diff payloads and line kinds deterministically", () => {
    const diff = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1 +1 @@",
      "-const value = 1;",
      "+const value = 2;",
      " context line",
    ].join("\n");
    const payload = resolveStructuredOutputPayload({
      value: diff,
      toolName: "file_change",
      part: "output",
      contextValue: { path: "src/app.ts" },
    });

    expect(isUnifiedDiffText(diff)).toBe(true);
    expect(payload).not.toBeNull();
    expect(payload?.kind).toBe("diff");
    expect(classifyDiffLineForChat("diff --git a/x b/x")).toBe("meta");
    expect(classifyDiffLineForChat("--- a/x")).toBe("file");
    expect(classifyDiffLineForChat("@@ -1 +1 @@")).toBe("hunk");
    expect(classifyDiffLineForChat("-a")).toBe("del");
    expect(classifyDiffLineForChat("+b")).toBe("add");
    expect(classifyDiffLineForChat(" context")).toBe("context");
  });

  it("uses path hints to classify text output language as yaml", () => {
    const payload = resolveStructuredOutputPayload({
      value: "name: setta\nenabled: true",
      toolName: "mcp__workspace__read_file",
      part: "output",
      contextValue: { path: "configs/app.yaml" },
    });

    expect(payload).not.toBeNull();
    expect(payload?.kind).toBe("code");
    expect(payload?.language).toBe("yaml");
    expect(payload?.text).toContain("name: setta");
  });

  it("treats command input payloads as bash code", () => {
    const payload = resolveStructuredOutputPayload({
      value: { command: "git status" },
      toolName: "command_execution",
      part: "input",
    });

    expect(payload).not.toBeNull();
    expect(payload?.kind).toBe("code");
    expect(payload?.language).toBe("bash");
    expect(payload?.text).toBe("git status");
  });

  it("uses object diff fields before generic json formatting", () => {
    const diff = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1 +1 @@",
      "-const value = 1;",
      "+const value = 2;",
    ].join("\n");
    const payload = resolveStructuredOutputPayload({
      value: { diff, path: "src/app.ts" },
      toolName: "file_change",
      part: "output",
    });

    expect(payload).not.toBeNull();
    expect(payload?.kind).toBe("diff");
    expect(payload?.text).toBe(diff);
  });
});
