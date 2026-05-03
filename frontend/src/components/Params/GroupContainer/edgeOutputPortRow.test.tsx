import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EdgeOutputPortRow, type EdgeStripAppearance } from "./groupContainer";

describe("EdgeOutputPortRow", () => {
  it("renders passive output handles when scene metadata owns GPU output ports", () => {
    const markup = renderToStaticMarkup(
      <EdgeOutputPortRow
        appearance={edgeStripAppearanceFixture()}
        canConnect
        port={{ id: "out", label: "result" }}
        renderInteractiveHandle={false}
      />,
    );

    expect(markup).toContain("setta-gpu-flow__handle-right");
    expect(markup).toContain("arg-edge-handle--source");
    expect(markup).not.toContain("data-handleid");
    expect(markup).not.toContain("connectionindicator");
  });
});

function edgeStripAppearanceFixture(): EdgeStripAppearance {
  return {
    dividerColorClassName: "",
    edgeLabelColorClassName: "",
    edgeRowHoverClassName: "",
    edgeRowSelectedClassName: "",
    edgeRowTextColorClassName: "",
    edgeStripBgColorClassName: "",
    handlePreventSectionClassName: "prevent-section",
    handleSelectableClassName: "",
    roundedBottomClassName: "",
    rowPreventSectionClassName: "",
    stripBorderColorClassName: "",
  };
}
