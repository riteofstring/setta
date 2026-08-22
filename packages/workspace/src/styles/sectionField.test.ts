import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The section-field surface is the one place a package-owned control has to match frozen main's
// callable field exactly, and its accepted defect was that activating the field changed its size
// and its type. These cases pin the donor box, the donor light/dark paint, and the invariant that
// makes the swap invisible: one wrapper owns the box, one class owns the type, and the live
// CodeMirror layers inherit that type instead of bringing CodeMirror's own.

const sectionFieldStyles = readFileSync(
  new URL("./sectionField.css", import.meta.url),
  "utf8",
);

const WRAPPER = ".setta-workspace-section-field";
const EDITOR = ".setta-workspace-section-field-editor";
const LIVE = ".setta-workspace-section-field-editor-live";

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

const rules = parseRules(sectionFieldStyles);

function ruleFor(selector: string): StyleRule {
  const normalized = selector.replaceAll(/\s+/gu, " ");
  const rule = rules.find((candidate) => candidate.selector === normalized);
  if (!rule) {
    throw new Error(`The section-field stylesheet declares no ${selector}.`);
  }
  return rule;
}

function rulesTargeting(fragment: string): Array<StyleRule> {
  return rules.filter((rule) => rule.selector.includes(fragment));
}

describe("section-field surface contract", () => {
  it("gives the field main's callable pill in one box owner", () => {
    const wrapper = ruleFor(WRAPPER);
    expect(wrapper.declarations.get("border-radius")).toBe("16px");
    expect(wrapper.declarations.get("padding")).toBe("4px 10px");
    expect(wrapper.declarations.get("margin-inline")).toBe("2px");
    // Main's field begins at the section header's boundary and its Args surface begins at the
    // field's, so no rule here may open a block gap around the section's primary control.
    expect(
      rules.filter((rule) =>
        [...rule.declarations.keys()].some((property) =>
          /^margin(-block|-block-start|-block-end|-top|-bottom)?$/u.test(
            property,
          ),
        ),
      ),
    ).toStrictEqual([]);
    expect(wrapper.declarations.get("border")).toBe(
      "1px solid hsl(219 24% 89%)",
    );
    // No other rule may re-open the box: a second padding or border owner is how the idle and
    // live layers drifted apart in main.
    const boxOwners = rules.filter(
      (rule) =>
        (rule.selector === WRAPPER || rule.selector.startsWith(`${LIVE} `)) &&
        ["border", "border-radius", "border-width", "padding"].some(
          (property) => rule.declarations.has(property),
        ),
    );
    expect(boxOwners.map((rule) => rule.selector)).toStrictEqual([
      WRAPPER,
      `${LIVE} .cm-content, ${LIVE} .cm-line`,
    ]);
  });

  it("paints main's light and dark field colours", () => {
    expect(ruleFor(WRAPPER).declarations.get("background-color")).toBe(
      "rgb(255 255 255)",
    );
    const dark = ruleFor(`.setta-workspace.setta-workspace-dark ${WRAPPER}`);
    expect(dark.declarations.get("border-color")).toBe("hsl(220 26% 14%)");
    expect(dark.declarations.get("background-color")).toBe("hsl(220 25% 3%)");
  });

  it("keeps a diagnostic field red through its idle and focused layers", () => {
    const diagnostic = ruleFor(`${WRAPPER}[data-diagnostic="true"]`);
    expect(diagnostic.declarations.get("border-color")).toBe(
      "rgb(254 202 202)",
    );
    expect(diagnostic.declarations.get("background-color")).toBe(
      "rgb(254 202 202)",
    );
    const darkDiagnostic = ruleFor(
      `.setta-workspace.setta-workspace-dark ${WRAPPER}[data-diagnostic="true"]`,
    );
    expect(darkDiagnostic.declarations.get("border-color")).toBe(
      "rgb(153 27 27 / 30%)",
    );
    expect(
      ruleFor(
        `${WRAPPER}[data-diagnostic="true"]:focus-within`,
      ).declarations.get("border-color"),
    ).toBe("rgb(254 202 202)");
    const indicator = ruleFor(
      ".setta-workspace-section-field-diagnostic-indicator",
    );
    expect(indicator.declarations.get("inline-size")).toBe("18px");
    expect(indicator.declarations.get("block-size")).toBe("18px");
    expect(indicator.declarations.get("background-color")).toBe(
      "rgb(239 68 68 / 80%)",
    );
  });

  it("changes only the border colour when the field takes focus", () => {
    const light = ruleFor(`${WRAPPER}:focus-within`);
    expect(light.declarations.get("border-color")).toBe("rgb(59 130 246)");
    expect([...light.declarations.keys()]).toStrictEqual(["border-color"]);
    const dark = ruleFor(
      `.setta-workspace.setta-workspace-dark ${WRAPPER}:focus-within`,
    );
    expect(dark.declarations.get("border-color")).toBe("rgb(96 165 250 / 50%)");
    expect([...dark.declarations.keys()]).toStrictEqual(["border-color"]);
  });

  it("keeps an ordinary disabled field's paint identical to an enabled one", () => {
    const disabled = rules.filter((rule) =>
      rule.selector.includes('data-disabled="true"'),
    );
    expect(disabled).toStrictEqual([]);
  });

  it("declares the idle and live layers' shared 12px monospace type once", () => {
    const editor = ruleFor(EDITOR);
    expect(editor.declarations.get("font-size")).toBe("12px");
    expect(editor.declarations.get("line-height")).toBe("16px");
    expect(editor.declarations.get("font-weight")).toBe("400");
    expect(editor.declarations.get("font-family")).toMatch(
      /^ui-monospace, SFMono-Regular, .*monospace$/u,
    );
    expect(editor.declarations.get("tab-size")).toBe("4");
  });

  it("hands every live CodeMirror layer back to that type and padding", () => {
    const inherited = ruleFor(
      `${LIVE} .cm-editor, ${LIVE} .cm-scroller, ${LIVE} .cm-content, ${LIVE} .cm-line`,
    );
    expect(inherited.declarations.get("font")).toBe("inherit");
    expect(
      ruleFor(`${LIVE} .cm-content, ${LIVE} .cm-line`).declarations.get(
        "padding",
      ),
    ).toBe("0");
    // Any live-only font declaration reintroduces the rejected activation jump.
    const liveTypeDeclarations = rulesTargeting(LIVE).flatMap((rule) =>
      [...rule.declarations.keys()].filter(
        (property) => property.startsWith("font") || property === "line-height",
      ),
    );
    expect(liveTypeDeclarations).toStrictEqual(["font"]);
  });
});
