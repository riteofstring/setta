import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DummyCodeMirror } from "./DummyCodeMirror";

describe("DummyCodeMirror canvas-owned resting text", () => {
  it("uses lightweight markup for single-line canvas-owned resting text", () => {
    const markup = renderToStaticMarkup(
      <DummyCodeMirror
        canvasOwnedRestingText={true}
        divId="canvas-owned-text"
        code="python"
        className="section-value opacity-0"
        theme={[]}
        language="python"
        singleLine={true}
      />,
    );

    expect(markup).toContain(
      'data-canvas-owned-resting-text-lightweight="true"',
    );
    expect(markup).not.toContain('class="cm-line"');
    expect(markup).toContain(">python</div>");
  });

  it("keeps lightweight logical lines for multiline canvas-owned resting text", () => {
    const markup = renderToStaticMarkup(
      <DummyCodeMirror
        canvasOwnedRestingText={true}
        divId="canvas-owned-multiline-text"
        code={"foo\nbar"}
        className="section-value opacity-0"
        theme={[]}
        language="python"
      />,
    );

    expect(markup).toContain(
      'data-canvas-owned-resting-text-lightweight="true"',
    );
    expect(markup).toContain('<div class="cm-line">foo</div>');
    expect(markup).toContain('<div class="cm-line">bar</div>');
    expect(markup).not.toContain("<span");
  });

  it("can mark the lightweight root as the retained underline measurement target", () => {
    const markup = renderToStaticMarkup(
      <DummyCodeMirror
        canvasOwnedRestingText={true}
        canvasOwnedUnderline={true}
        divId="canvas-owned-text-underline"
        code="python"
        className="section-value border-b opacity-0"
        theme={[]}
        language="python"
        singleLine={true}
      />,
    );

    expect(markup).toContain('data-canvas-owned-underline="true"');
    expect(markup.match(/data-canvas-owned-underline="true"/g)?.length).toBe(1);
  });
});
