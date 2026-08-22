import { describe, expect, it } from "vitest";

import { PYTHON_KEYWORDS_V2 } from "../backend/generatedContract";
import {
  hasBlockingParameterName,
  parameterNameErrors,
} from "./parameterNames";

describe("parameterNameErrors", () => {
  it("keeps blank app-authored rows local while rejecting invalid names", () => {
    const rows = [
      row("parameter:blank", "", true),
      row("parameter:duplicate-a", "scale", true),
      row("parameter:duplicate-b", "scale", true),
      row("parameter:provider", "value", false),
      row("parameter:invalid", "not-valid", true),
    ];

    expect(parameterNameErrors(rows)).toEqual({
      "parameter:duplicate-a":
        'Param name "scale" already exists under this parent.',
      "parameter:duplicate-b":
        'Param name "scale" already exists under this parent.',
      "parameter:invalid": "Param name must be a valid Python identifier.",
    });
    expect(hasBlockingParameterName(rows)).toBe(true);
  });

  it("uses the generated Python keyword rule", () => {
    for (const keyword of PYTHON_KEYWORDS_V2) {
      expect(
        parameterNameErrors([row(`parameter:${keyword}`, keyword, true)]),
      ).toEqual({
        [`parameter:${keyword}`]: "Param name cannot be a Python keyword.",
      });
    }
  });
});

function row(id: string, name: string, nameEditable: boolean) {
  return { data: { name, nameEditable }, id };
}
