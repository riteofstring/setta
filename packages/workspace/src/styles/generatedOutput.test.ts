import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The generated-output surface is the second place a package-owned control has to carry frozen
// main's paint exactly, and its accepted defect was that generated Python looked like an ordinary
// editor. These cases pin main's region, rail, rounded ends, badge, and selection paint in both
// appearances, and the invariant that keeps a pointer press from repainting the surface: the
// wrapper carries no focus fill, only a keyboard-visible cue.

const generatedOutputStyles = readFileSync(
  new URL("./generatedOutput.css", import.meta.url),
  "utf8",
);

const SURFACE = ".setta-workspace-generated-output";
const DARK = ".setta-workspace.setta-workspace-dark";

type StyleRule = {
  selector: string;
  declarations: Map<string, string>;
};

function parseRules(css: string): Array<StyleRule> {
  const withoutComments = css.replaceAll(/\/\*[\s\S]*?\*\//gu, "");
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map(
    (match) => ({
      selector: (match[1] ?? "").trim().replaceAll(/\s+/gu, " "),
      declarations: new Map(
        (match[2] ?? "")
          .split(";")
          .map((declaration) => declaration.trim())
          .filter((declaration) => declaration !== "")
          .map((declaration) => {
            const separator = declaration.indexOf(":");
            return [
              declaration.slice(0, separator).trim(),
              declaration
                .slice(separator + 1)
                .trim()
                .replaceAll(/\s+/gu, " "),
            ] as const;
          }),
      ),
    }),
  );
}

const rules = parseRules(generatedOutputStyles);

function ruleFor(selector: string): StyleRule {
  const normalized = selector.replaceAll(/\s+/gu, " ");
  const rule = rules.find((candidate) => candidate.selector === normalized);
  if (!rule) {
    throw new Error(`The generated-output stylesheet declares no ${selector}.`);
  }
  return rule;
}

describe("generated-output surface contract", () => {
  it("paints main's blue region behind its three-pixel rail in both appearances", () => {
    const light = ruleFor(SURFACE);
    expect(light.declarations.get("border-radius")).toBe("6px");
    expect(light.declarations.get("--setta-workspace-generated-region")).toBe(
      "rgb(219 234 254)",
    );
    expect(light.declarations.get("--setta-workspace-generated-rail")).toBe(
      "rgb(96 165 250)",
    );
    // One gradient owner over the two colours, so appearance changes the colours and nothing
    // about the region's geometry.
    expect(light.declarations.get("background")).toBe(
      "linear-gradient(90deg, var(--setta-workspace-generated-rail) 0 3px, var(--setta-workspace-generated-region) 3px)",
    );
    const dark = ruleFor(`${DARK} ${SURFACE}`);
    expect(dark.declarations.get("--setta-workspace-generated-region")).toBe(
      "rgb(23 37 84)",
    );
    expect(dark.declarations.get("--setta-workspace-generated-rail")).toBe(
      "rgb(37 99 235)",
    );
    expect(dark.declarations.has("background")).toBe(false);
  });

  it("carries main's compact uppercase generated/read-only badge", () => {
    const badge = ruleFor(`${SURFACE}::after`);
    expect(badge.declarations.get("content")).toBe('"Generated read-only"');
    expect(badge.declarations.get("text-transform")).toBe("uppercase");
    expect(badge.declarations.get("font-size")).toBe("8px");
    expect(badge.declarations.get("border-radius")).toBe("999px");
    expect(badge.declarations.get("padding")).toBe("1px 5px");
    expect(badge.declarations.get("background-color")).toBe(
      "var(--setta-workspace-generated-badge)",
    );
    expect(badge.declarations.get("color")).toBe(
      "var(--setta-workspace-generated-badge-text)",
    );
    // The badge is decoration over the reader's text, never a pointer target.
    expect(badge.declarations.get("pointer-events")).toBe("none");
    expect(
      ruleFor(SURFACE).declarations.get("--setta-workspace-generated-badge"),
    ).toBe("rgb(37 99 235)");
    expect(
      ruleFor(`${DARK} ${SURFACE}`).declarations.get(
        "--setta-workspace-generated-badge",
      ),
    ).toBe("rgb(30 64 175)");
  });

  it("keeps the output selectable against main's own selection paint", () => {
    const selection = ruleFor(
      `${SURFACE} .cm-line::selection, ${SURFACE} .cm-line ::selection`,
    );
    expect(selection.declarations.get("background-color")).toBe(
      "hsl(246 98% 23%)",
    );
    expect(selection.declarations.get("color")).toBe("rgb(255 255 255)");
  });

  it("gives the surface a keyboard-only focus cue and no pointer repaint", () => {
    expect(ruleFor(`${SURFACE}:focus-visible`).declarations.get("outline")).toBe(
      "2px solid var(--setta-workspace-generated-badge)",
    );
    // Any plain `:focus` rule would repaint the region under a pointer press, which is exactly
    // the state the developer rejected.
    expect(
      rules.filter((rule) => /:focus(?!-visible)/u.test(rule.selector)),
    ).toStrictEqual([]);
  });

  it("restores the region, rail, and badge once forced colours drop them", () => {
    expect(generatedOutputStyles).toMatch(
      /@media \(forced-colors: active\)[\s\S]*border-inline-start: 3px solid CanvasText/u,
    );
    expect(generatedOutputStyles).toMatch(
      /@media \(forced-colors: active\)[\s\S]*::after\s*\{[^}]*border: 1px solid CanvasText/u,
    );
    expect(generatedOutputStyles).toMatch(
      /@media \(forced-colors: active\)[\s\S]*:focus-visible\s*\{[^}]*outline-color: Highlight/u,
    );
  });
});
