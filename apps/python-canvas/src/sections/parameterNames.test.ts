import { describe, expect, it } from "vitest";

import { PYTHON_KEYWORDS_V1 } from "../backend/generatedContract";
import {
  hasBlockingParameterName,
  parameterNameErrors,
} from "./parameterNames";

describe("callable parameter names", () => {
  it("leaves a record nobody has named yet alone", () => {
    // Main's new kwarg arrives blank and stays legal until it is written, and the store keeps it
    // out of the rendered call rather than refusing it.
    expect(parameterNameErrors([authored("")])).toEqual({});
    expect(hasBlockingParameterName([authored("")])).toBe(false);
  });

  it("accepts the names Python can take as a keyword argument", () => {
    const rows = [authored("scale"), authored("_offset"), authored("x2")];

    expect(parameterNameErrors(rows)).toEqual({});
    expect(hasBlockingParameterName(rows)).toBe(false);
  });

  it("refuses a name Python cannot use as an identifier", () => {
    expect(parameterNameErrors([authored("2x")])).toEqual({
      "parameter:authored:2x": "Param name must be a valid Python identifier.",
    });
    expect(parameterNameErrors([authored("with space")])).toEqual({
      "parameter:authored:with space":
        "Param name must be a valid Python identifier.",
    });
    expect(hasBlockingParameterName([authored("2x")])).toBe(true);
  });

  it("refuses every word the store's own keyword list reserves", () => {
    // The list is generated from the one Go owner, so this rule and the store's cannot disagree
    // about which names exist; a hand-edited list on either side fails here.
    for (const keyword of PYTHON_KEYWORDS_V1) {
      expect(parameterNameErrors([authored(keyword)])).toEqual({
        [`parameter:authored:${keyword}`]:
          "Param name cannot be a Python keyword.",
      });
    }
  });

  it("refuses a name another record under this callable already claims", () => {
    // One call cannot take the same argument twice: the store would render a repeated keyword
    // argument, which Python refuses to parse.
    const rows = [authored("scale"), { ...authored("scale"), id: "second" }];

    expect(parameterNameErrors(rows)).toEqual({
      "parameter:authored:scale":
        'Param name "scale" already exists under this parent.',
      second: 'Param name "scale" already exists under this parent.',
    });
    expect(hasBlockingParameterName(rows)).toBe(true);
  });

  it("counts the resolved signature's own name as a claim on this list", () => {
    // Naming an authored row `x` is the quieter half of the same defect: both records sanitize to
    // one generated path, so one assignment silently overwrites the other. The row a person can
    // fix is the one that reports it.
    const rows = [provider("x"), authored("x")];

    expect(parameterNameErrors(rows)).toEqual({
      "parameter:authored:x":
        'Param name "x" already exists under this parent.',
    });
  });

  it("reads a name the way the store does, without its surrounding whitespace", () => {
    const rows = [
      authored("scale"),
      { ...authored("  scale  "), id: "second" },
    ];

    // The store trims before it stores, so a padded name is the same claim and the same record.
    expect(Object.keys(parameterNameErrors(rows))).toEqual([
      "parameter:authored:scale",
      "second",
    ]);
    expect(parameterNameErrors([authored("  scale  ")])).toEqual({});
  });

  it("reports the name's own problem before the list's", () => {
    // Main resolves the duplicate only once the name itself is usable, so a repeated keyword
    // still reads as the keyword problem it is.
    expect(
      parameterNameErrors([
        authored("class"),
        { ...authored("class"), id: "second" },
      ]),
    ).toEqual({
      "parameter:authored:class": "Param name cannot be a Python keyword.",
      second: "Param name cannot be a Python keyword.",
    });
  });
});

function authored(name: string) {
  return {
    data: { name, nameEditable: true },
    id: `parameter:authored:${name}`,
  };
}

function provider(name: string) {
  return {
    data: { name, nameEditable: false },
    id: "parameter:square-root:provider",
  };
}
