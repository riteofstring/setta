import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDummyCodeMirrorHighlightCache,
  getCachedHighlightedCodeOutput,
} from "./DummyCodeMirror";

const highlightTreeSpy = vi.hoisted(() => vi.fn());

vi.mock("@lezer/highlight", () => ({
  highlightTree: highlightTreeSpy,
}));

describe("DummyCodeMirror highlight cache", () => {
  beforeEach(() => {
    clearDummyCodeMirrorHighlightCache();
    highlightTreeSpy.mockClear();
  });

  it("reuses highlighted output for unchanged code/language/theme", () => {
    const parseSpy = vi.fn(() => ({ tree: "ok" }));
    const parser = { parse: parseSpy };
    const theme = [[{ value: "scope-class" }], [null, null, { value: [] }]];

    getCachedHighlightedCodeOutput({
      code: "print('hello')",
      language: "python",
      parser,
      theme,
    });
    getCachedHighlightedCodeOutput({
      code: "print('hello')",
      language: "python",
      parser,
      theme,
    });

    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(highlightTreeSpy).toHaveBeenCalledTimes(1);
  });

  it("recomputes highlighted output when code changes", () => {
    const parseSpy = vi.fn(() => ({ tree: "ok" }));
    const parser = { parse: parseSpy };
    const theme = [[{ value: "scope-class" }], [null, null, { value: [] }]];

    getCachedHighlightedCodeOutput({
      code: "print('hello')",
      language: "python",
      parser,
      theme,
    });
    getCachedHighlightedCodeOutput({
      code: "print('goodbye')",
      language: "python",
      parser,
      theme,
    });

    expect(parseSpy).toHaveBeenCalledTimes(2);
    expect(highlightTreeSpy).toHaveBeenCalledTimes(2);
  });
});
