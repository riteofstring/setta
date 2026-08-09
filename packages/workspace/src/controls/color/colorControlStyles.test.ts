import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import postcss, { type Rule } from "postcss";
import { describe, expect, it } from "vitest";

function getWorkspaceStylesheet(): string {
  const testPath = expect.getState().testPath;
  if (!testPath) {
    throw new Error("expected vitest to expose the color-control style test path");
  }
  return readFileSync(join(dirname(testPath), "../../styles/workspace.css"), "utf8");
}

function getRule(root: postcss.Root, selector: string): Rule {
  const rule = root.nodes.find(
    (node): node is Rule => node.type === "rule" && node.selector === selector,
  );
  if (!rule) {
    throw new Error(`expected workspace.css to contain ${selector}`);
  }
  return rule;
}

function declarations(rule: Rule): Record<string, string> {
  return Object.fromEntries(
    rule.nodes.filter((node) => node.type === "decl").map((node) => [node.prop, node.value]),
  );
}

describe("native color control styles", () => {
  const root = postcss.parse(getWorkspaceStylesheet());

  it("scopes frozen main's WebKit edge-to-edge swatch normalization to the package input", () => {
    expect(
      declarations(
        getRule(root, "input.setta-workspace-native-color::-webkit-color-swatch-wrapper"),
      ),
    ).toEqual({ padding: "0" });
    expect(
      declarations(getRule(root, "input.setta-workspace-native-color::-webkit-color-swatch")),
    ).toEqual({ border: "0", "border-radius": "0" });
  });

  it("keeps the corresponding Firefox reset scoped to the package input", () => {
    expect(
      declarations(
        getRule(
          root,
          "input.setta-workspace-native-color::-moz-color-swatch,\ninput.setta-workspace-native-color::-moz-focus-inner",
        ),
      ),
    ).toEqual({ border: "0" });
    expect(
      declarations(getRule(root, "input.setta-workspace-native-color::-moz-focus-inner")),
    ).toEqual({ padding: "0" });
  });
});
