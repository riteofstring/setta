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
  });

  it("uses reduced padding for right panes", () => {
    const markup = renderToStaticMarkup(
      <PaneContainer {...baseProps} right={true}>
        <div>Pane</div>
      </PaneContainer>,
    );

    expect(markup).toContain("py-2.5");
    expect(markup).toContain("pr-7");
  });
});
