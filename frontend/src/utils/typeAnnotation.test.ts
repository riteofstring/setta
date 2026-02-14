import { describe, expect, it } from "vitest";
import { isStringTypeAnnotation } from "./typeAnnotation";

describe("isStringTypeAnnotation", () => {
  it("accepts direct str annotations", () => {
    expect(isStringTypeAnnotation("str")).toBe(true);
    expect(isStringTypeAnnotation("builtins.str")).toBe(true);
  });

  it("accepts optional and nullable string unions", () => {
    expect(isStringTypeAnnotation("Optional[str]")).toBe(true);
    expect(isStringTypeAnnotation("typing.Optional[builtins.str]")).toBe(true);
    expect(isStringTypeAnnotation("str | None")).toBe(true);
    expect(isStringTypeAnnotation("typing.Union[str, NoneType]")).toBe(true);
  });

  it("rejects non-string and mixed unions", () => {
    expect(isStringTypeAnnotation("int")).toBe(false);
    expect(isStringTypeAnnotation("typing.Union[str, int]")).toBe(false);
    expect(isStringTypeAnnotation("list[str]")).toBe(false);
  });
});
