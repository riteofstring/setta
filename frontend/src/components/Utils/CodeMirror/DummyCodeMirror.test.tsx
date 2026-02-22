import { renderToStaticMarkup } from "react-dom/server";
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
    highlightTreeSpy.mockReset();
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

  it("merges adjacent ranges that share the same highlight class", () => {
    const parseSpy = vi.fn(() => ({ tree: "ok" }));
    const parser = { parse: parseSpy };
    const theme = [[{ value: "scope-class" }], [null, null, { value: [] }]];
    highlightTreeSpy.mockImplementation((_tree, _style, add) => {
      add(0, 1, "tok");
      add(1, 3, "tok");
      add(3, 4, "other");
    });

    const { outputDivs } = getCachedHighlightedCodeOutput({
      code: "abcd",
      language: "python",
      parser,
      theme,
    });

    const markup = renderToStaticMarkup(<>{outputDivs}</>);
    const tokSpanCount = (markup.match(/class="tok"/g) ?? []).length;
    expect(tokSpanCount).toBe(1);
    expect(markup).toContain('<span class="tok">abc</span>');
    expect(markup).toContain('<span class="other">d</span>');
  });

  it("keeps separated same-class ranges as distinct spans", () => {
    const parseSpy = vi.fn(() => ({ tree: "ok" }));
    const parser = { parse: parseSpy };
    const theme = [[{ value: "scope-class" }], [null, null, { value: [] }]];
    highlightTreeSpy.mockImplementation((_tree, _style, add) => {
      add(0, 1, "tok");
      add(2, 3, "tok");
    });

    const { outputDivs } = getCachedHighlightedCodeOutput({
      code: "abcd",
      language: "python",
      parser,
      theme,
    });

    const markup = renderToStaticMarkup(<>{outputDivs}</>);
    const tokSpanCount = (markup.match(/class="tok"/g) ?? []).length;
    expect(tokSpanCount).toBe(2);
    expect(markup).toContain(
      '<span class="tok">a</span>b<span class="tok">c</span>',
    );
  });
});
