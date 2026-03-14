import { describe, expect, it } from "vitest";
import {
  formatMaxIterationsDraft,
  parseMaxIterationsDraft,
} from "./StateMachineSectionSettings";

describe("StateMachineSectionSettings max iteration parsing", () => {
  it("formats null max iterations as an empty draft", () => {
    expect(formatMaxIterationsDraft(null)).toBe("");
    expect(formatMaxIterationsDraft(3)).toBe("3");
  });

  it("parses positive integers and allows an empty unlimited value", () => {
    expect(parseMaxIterationsDraft("")).toBeNull();
    expect(parseMaxIterationsDraft(" 4 ")).toBe(4);
  });

  it("rejects zero, negatives, and non-integer drafts", () => {
    expect(parseMaxIterationsDraft("0")).toBe("invalid");
    expect(parseMaxIterationsDraft("-1")).toBe("invalid");
    expect(parseMaxIterationsDraft("2.5")).toBe("invalid");
    expect(parseMaxIterationsDraft("nope")).toBe("invalid");
  });
});
