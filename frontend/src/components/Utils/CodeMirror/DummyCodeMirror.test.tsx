import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DummyCodeMirror } from "./DummyCodeMirror";
import { getCodeMirrorStyle } from "./useCodeMirrorStyle";

const theme = getCodeMirrorStyle(false, undefined);

describe("DummyCodeMirror", () => {
  it("skips cm-line wrappers for single-line highlighted code", () => {
    // Single-line fields should render as one flat text host to avoid per-line wrappers.
    const markup = renderToStaticMarkup(
      <DummyCodeMirror
        divId="dummy-single-line"
        code="print('hello')"
        theme={theme}
        className="section-value"
        language="python"
        singleLine={true}
      />,
    );

    expect(markup).not.toContain('class="cm-line"');
    expect(markup).toContain("print");
  });

  it("keeps cm-line wrappers for multiline highlighted code", () => {
    // Multiline rendering should preserve explicit line wrappers.
    const markup = renderToStaticMarkup(
      <DummyCodeMirror
        divId="dummy-multi-line"
        code={"line1\nline2"}
        theme={theme}
        className="section-value"
        language="python"
        singleLine={false}
      />,
    );

    expect(markup).toContain('class="cm-line"');
  });

  it("skips cm-line wrappers for one-line highlighted code in multiline mode", () => {
    // One-line values should avoid extra line containers even when multiline mode is enabled.
    const markup = renderToStaticMarkup(
      <DummyCodeMirror
        divId="dummy-multiline-single-row"
        code="line1"
        theme={theme}
        className="section-value"
        language="python"
        singleLine={false}
      />,
    );

    expect(markup).not.toContain('class="cm-line"');
  });

  it("skips cm-line wrappers for single-line fallback rendering", () => {
    // Unknown language fallback follows the same single-line flattening path.
    const markup = renderToStaticMarkup(
      <DummyCodeMirror
        divId="dummy-single-line-fallback"
        code="raw-text-value"
        theme={theme}
        className="section-value"
        language={undefined}
        singleLine={true}
      />,
    );

    expect(markup).not.toContain('class="cm-line"');
    expect(markup).toContain("raw-text-value");
  });
});
