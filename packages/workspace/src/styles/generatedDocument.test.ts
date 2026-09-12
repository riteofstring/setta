import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const generatedDocumentStyles = readFileSync(
  new URL("./generatedDocument.css", import.meta.url),
  "utf8",
);

const SURFACE = ".setta-workspace-generated-document";
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

                .replaceAll(/\s+/gu, " ")
                .replaceAll(/\(\s/gu, "(")
                .replaceAll(/\s\)/gu, ")"),
            ] as const;
          }),
      ),
    }),
  );
}

const rules = parseRules(generatedDocumentStyles);

function ruleFor(selector: string): StyleRule {
  const normalized = selector.replaceAll(/\s+/gu, " ");
  const rule = rules.find((candidate) => candidate.selector === normalized);
  if (!rule) {
    throw new Error(
      `The generated-document stylesheet declares no ${selector}.`,
    );
  }
  return rule;
}

describe("generated-document surface contract", () => {
  it("paints main's blue region behind its three-pixel rail in both appearances", () => {
    const light = ruleFor(SURFACE);
    expect(light.declarations.get("--setta-workspace-generated-region")).toBe(
      "rgb(219 234 254)",
    );
    expect(light.declarations.get("--setta-workspace-generated-rail")).toBe(
      "rgb(96 165 250)",
    );

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
    const surface = ruleFor(SURFACE);
    expect(surface.declarations.has("background")).toBe(false);
    expect(surface.declarations.has("border-radius")).toBe(false);
    expect(rules.some((rule) => rule.selector === `${SURFACE}::after`)).toBe(
      false,
    );

    const region = ruleFor(`${LINE}::before`);
    expect(region.declarations.get("content")).toBe('""');
    expect(region.declarations.get("position")).toBe("absolute");

    expect(region.declarations.get("inset-block")).toBe(
      "calc(-1 * var(--setta-workspace-generated-overlap))",
    );
    expect(
      surface.declarations.get("--setta-workspace-generated-overlap"),
    ).toBe("2px");

    expect(region.declarations.get("z-index")).toBe("-1");
    expect(ruleFor(LINE).declarations.get("position")).toBe("relative");

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

  it("shows only the block's lip on the two lines its region bounds", () => {
    expect(ruleFor(`${START}::before`).declarations).toEqual(
      new Map([
        ["inset-block-start", "var(--setta-workspace-generated-boundary)"],
      ]),
    );
    expect(ruleFor(`${END}::before`).declarations).toEqual(
      new Map([
        ["inset-block-end", "var(--setta-workspace-generated-boundary)"],
      ]),
    );
    expect(
      ruleFor(SURFACE).declarations.get("--setta-workspace-generated-boundary"),
    ).toBe("80%");

    expect(
      rules.filter(
        (rule) =>
          rule.selector.includes(ONLY) &&
          ["inset-block-start", "inset-block-end"].some((property) =>
            rule.declarations
              .get(property)
              ?.includes("--setta-workspace-generated-boundary"),
          ),
      ),
    ).toStrictEqual([]);
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

    expect(badge.declarations.get("inset-inline-start")).toBe("50%");
    expect(badge.declarations.get("transform")).toBe("translate(-50%, -50%)");
    expect(
      ruleFor(`${START}::after`).declarations.get("inset-block-start"),
    ).toBe("var(--setta-workspace-generated-boundary)");
    expect(
      ruleFor(`${ONLY}::after`).declarations.get("inset-block-start"),
    ).toBe("calc(-1 * var(--setta-workspace-generated-overlap))");
    expect(
      rules.some((rule) => rule.selector === `${SURFACE} .cm-content`),
    ).toBe(false);

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

  it("says with the pointer that the block refuses what is typed into it", () => {
    expect(ruleFor(LINE).declarations.get("cursor")).toBe("not-allowed");

    expect(rules.filter((rule) => /:focus/u.test(rule.selector))).toStrictEqual(
      [],
    );
  });

  it("restores the region, rail, and badge once forced colours drop them", () => {
    expect(generatedDocumentStyles).toMatch(
      /@media \(forced-colors: active\)[\s\S]*border-inline-start: 3px solid CanvasText/u,
    );
    expect(generatedDocumentStyles).toMatch(
      /@media \(forced-colors: active\)[\s\S]*::after\s*\{[^}]*border: 1px solid CanvasText/u,
    );
  });
});
