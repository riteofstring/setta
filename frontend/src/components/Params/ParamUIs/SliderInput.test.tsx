import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SliderInput } from "./SliderInput";

describe("SliderInput GPU flow ownership", () => {
  it("marks the slider surface as an explicit interactive nodrag target", () => {
    const markup = renderToStaticMarkup(
      <SliderInput
        value={5}
        min={0}
        max={10}
        step={1}
        wrapperDivClass="fixture-wrapper"
        sliderRootClassName="fixture-root"
        sliderTrackClassName="fixture-track"
        sliderRangeClassName="fixture-range"
        sliderThumbClassName="fixture-thumb"
        textInputClassName="fixture-input"
      />,
    );

    expect(markup).toContain('data-gpu-flow-interactive="true"');
    expect(markup).toContain("nodrag nopan fixture-wrapper");
    expect(markup).toContain("nodrag nopan fixture-root");
    expect(markup).toContain("nodrag nopan fixture-track");
    expect(markup).toContain("nodrag nopan fixture-thumb");
    expect(markup).toContain("nodrag nopan fixture-input");
  });
});
