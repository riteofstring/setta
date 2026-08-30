import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceGraphStyles = readFileSync(
  new URL("./workspaceGraph.css", import.meta.url),
  "utf8",
);

describe("workspace graph stylesheet contract", () => {
  it("styles the disabled modifier emitted by WorkspaceGraphPorts", () => {
    expect(workspaceGraphStyles).toMatch(
      /\.setta-workspace-graph-port--disabled\s*\{\s*opacity:\s*0\.42/su,
    );
    expect(workspaceGraphStyles).not.toContain(
      ".setta-workspace-graph-port-safe-zone--disabled",
    );
  });
});
