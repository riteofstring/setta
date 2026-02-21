import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaneContainer } from "./PaneContainer";

const baseProps = {
  paneName: "overview",
  minimumWidth: 250,
  vis: true,
  width: 320,
};

describe("PaneContainer", () => {
  it("uses reduced padding for left panes", () => {
    const markup = renderToStaticMarkup(
      <PaneContainer {...baseProps} right={false}>
        <div>Pane</div>
      </PaneContainer>,
    );

    expect(markup).toContain("py-2.5");
    expect(markup).toContain("pl-9");
    expect(markup).toContain("border-r");
  });

  it("uses reduced padding for right panes", () => {
    const markup = renderToStaticMarkup(
      <PaneContainer {...baseProps} right={true}>
        <div>Pane</div>
      </PaneContainer>,
    );

    expect(markup).toContain("py-2.5");
    expect(markup).toContain("pr-7");
    expect(markup).toContain("border-l");
  });

  it("removes seam border for full-width left pane", () => {
    const markup = renderToStaticMarkup(
      <PaneContainer {...baseProps} right={false} width={100000}>
        <div>Pane</div>
      </PaneContainer>,
    );

    expect(markup).toContain("border-r-0");
  });

  it("removes seam border for full-width right pane", () => {
    const markup = renderToStaticMarkup(
      <PaneContainer {...baseProps} right={true} width={100000}>
        <div>Pane</div>
      </PaneContainer>,
    );

    expect(markup).toContain("border-l-0");
  });
});
