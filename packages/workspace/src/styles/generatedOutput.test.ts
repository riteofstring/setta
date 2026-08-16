import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The generated-output surface is the second place a package-owned control has to carry frozen
// main's paint exactly, and its accepted defects were that generated Python looked like an ordinary
// editor and then that its region filled the section's unused height with a corner badge. These
// cases pin main's line-scoped region, rail, rounded ends, centred badge, and selection paint in
// both appearances; that the wrapper paints no region of its own; and the invariant that keeps a
// pointer press from repainting the surface: no focus fill, only a keyboard-visible cue.

const generatedOutputStyles = readFileSync(
  new URL("./generatedOutput.css", import.meta.url),
  "utf8",
);

const SURFACE = ".setta-workspace-generated-output";
const DARK = ".setta-workspace.setta-workspace-dark";
const LINE = `${SURFACE} [data-workspace-generated-line]`;
const START = `${SURFACE} [data-workspace-generated-line="start"]`;
const ONLY = `${SURFACE} [data-workspace-generated-line="only"]`;
const END = `${SURFACE} [data-workspace-generated-line="end"]`;

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
                // The policy formatter may wrap a long value across lines, so a value reads the
                // same here however it is laid out.
                .replaceAll(/\s+/gu, " ")
                .replaceAll(/\(\s/gu, "(")
                .replaceAll(/\s\)/gu, ")"),
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
    expect(light.declarations.get("--setta-workspace-generated-region")).toBe(
      "rgb(219 234 254)",
    );
    expect(light.declarations.get("--setta-workspace-generated-rail")).toBe(
      "rgb(96 165 250)",
    );
    // One gradient owner over the two colours, so appearance changes the colours and nothing
    // about the region's geometry.
    const region = ruleFor(`${LINE}::before`);
    expect(region.declarations.get("background")).toBe(
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

  it("hugs the rendered lines instead of filling the section's unused height", () => {
    // The rejected candidate painted the flex-filling wrapper, so an eight-line document sat
    // above an empty blue panel. The region belongs to the lines and to nothing else.
    const surface = ruleFor(SURFACE);
    expect(surface.declarations.has("background")).toBe(false);
    expect(surface.declarations.has("border-radius")).toBe(false);
    expect(rules.some((rule) => rule.selector === `${SURFACE}::after`)).toBe(
      false,
    );

    const region = ruleFor(`${LINE}::before`);
    expect(region.declarations.get("content")).toBe('""');
    expect(region.declarations.get("position")).toBe("absolute");
    // Main's own overlap, so adjacent line regions meet with no seam between line boxes.
    expect(region.declarations.get("inset-block")).toBe(
      "calc(-1 * var(--setta-workspace-generated-overlap))",
    );
    expect(
      surface.declarations.get("--setta-workspace-generated-overlap"),
    ).toBe("2px");
    // Behind the code it decorates, never over it.
    expect(region.declarations.get("z-index")).toBe("-1");
    expect(ruleFor(LINE).declarations.get("position")).toBe("relative");

    // Only the block's own ends are rounded, and a one-line document is both ends at once.
    expect(ruleFor(`${START}::before, ${ONLY}::before`).declarations).toEqual(
      new Map([
        ["border-start-start-radius", "6px"],
        ["border-start-end-radius", "6px"],
      ]),
    );
    expect(ruleFor(`${END}::before, ${ONLY}::before`).declarations).toEqual(
      new Map([
        ["border-end-start-radius", "6px"],
        ["border-end-end-radius", "6px"],
      ]),
    );
  });

  it("carries main's compact uppercase generated/read-only badge over the block's top edge", () => {
    const badge = ruleFor(`${START}::after, ${ONLY}::after`);
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
    // Centred on the block's upper boundary rather than pinned to a corner of the wrapper.
    expect(badge.declarations.get("inset-inline-start")).toBe("50%");
    expect(badge.declarations.get("inset-block-start")).toBe(
      "calc(-1 * var(--setta-workspace-generated-overlap))",
    );
    expect(badge.declarations.get("transform")).toBe("translate(-50%, -50%)");
    // Main reserves that space with the blank line above its generated range; a whole generated
    // document has none, so the editor's own top padding reserves it without changing the bytes.
    expect(
      ruleFor(`${SURFACE} .cm-content`).declarations.get("padding-block-start"),
    ).toBe("12px");
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
    expect(
      ruleFor(`${SURFACE}:focus-visible`).declarations.get("outline"),
    ).toBe("2px solid var(--setta-workspace-generated-badge)");
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
