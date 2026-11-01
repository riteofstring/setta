import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspaceGraphStyles = readFileSync(
  new URL("./workspaceGraph.css", import.meta.url),
  "utf8",
);

function getRuleBody(selectorPattern: RegExp): string {
  const match = workspaceGraphStyles.match(
    new RegExp(`${selectorPattern.source}\\s*\\{([^}]*)\\}`, "su"),
  );
  if (!match?.[1]) {
    throw new Error(`No graph rule matched ${selectorPattern.source}.`);
  }
  return match[1];
}

describe("workspace graph stylesheet contract", () => {
  it("paints edges, ports, and previews from the host family color", () => {
    const familyColor = "var(--setta-workspace-graph-family-color)";
    expect(
      getRuleBody(/\.setta-workspace \.setta-workspace-graph-edge-path/u),
    ).toContain(`stroke: ${familyColor}`);
    expect(
      getRuleBody(/\.setta-workspace \.setta-workspace-graph-port-dot/u),
    ).toContain(`background: ${familyColor}`);
    expect(
      getRuleBody(
        /\.setta-workspace \.setta-workspace-graph-connection-preview/u,
      ),
    ).toContain(`stroke: ${familyColor}`);
  });

  it("marks missing edges red in both themes", () => {
    expect(
      getRuleBody(
        /\.setta-workspace\s+\.setta-workspace-graph-edge\.setta-workspace-graph-edge--missing\s+\.setta-workspace-graph-edge-path/u,
      ),
    ).toMatch(/stroke: #ef4444;[^}]*stroke-dasharray/su);
    expect(
      getRuleBody(
        /\.setta-workspace\.setta-workspace-dark\s+\.setta-workspace-graph-edge\.setta-workspace-graph-edge--missing\s+\.setta-workspace-graph-edge-path/u,
      ),
    ).toContain("stroke: #f87171");
  });

  it("animates running edge flow only when motion is allowed", () => {
    const animationDeclarations = [
      ...workspaceGraphStyles.matchAll(/animation:[^;]*;/gu),
    ];
    expect(animationDeclarations).toHaveLength(1);
    const motionBlock = workspaceGraphStyles.match(
      /@media \(prefers-reduced-motion: no-preference\) \{.*?\n\}/su,
    )?.[0];
    expect(motionBlock).toContain("setta-workspace-graph-edge--running");
    expect(motionBlock).toContain("setta-workspace-graph-edge-flow");
  });
});
