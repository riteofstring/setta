import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ColorPickerInput } from "./ColorPickerInput";

const WRAPPER_CLASS_NAME =
  "section-value relative flex min-h-0 h-full w-full min-w-0 items-stretch";
const TRIGGER_CLASS_NAME =
  "colorpicker relative flex h-full min-h-0 w-full min-w-0 flex-1 cursor-pointer items-center overflow-hidden rounded-lg text-white";

describe("ColorPickerInput", () => {
  it("renders the native color input path without single-cell overlay classes", () => {
    const markup = renderToStaticMarkup(
      <ColorPickerInput
        colorChoices={[]}
        value="#ff0000"
        onChange={vi.fn()}
        wrapperClassName={WRAPPER_CLASS_NAME}
        colorPickerChoicesClasses={TRIGGER_CLASS_NAME}
      />,
    );

    expect(markup).toContain('type="color"');
    expect(markup).toContain("gg-color-picker");
    expect(markup).not.toContain("single-cell-container");
    expect(markup).not.toContain("single-cell-child");
  });

  it("renders the choice trigger path without single-cell overlay classes", () => {
    const markup = renderToStaticMarkup(
      <ColorPickerInput
        colorChoices={[
          { color: "#ff0000", description: "Red" },
          { color: "#00ff00", description: "Green" },
        ]}
        value="#00ff00"
        onChange={vi.fn()}
        wrapperClassName={WRAPPER_CLASS_NAME}
        colorPickerChoicesClasses={TRIGGER_CLASS_NAME}
      />,
    );

    expect(markup).toContain("Green");
    expect(markup).toContain("colorpicker");
    expect(markup).not.toContain("single-cell-container");
    expect(markup).not.toContain("single-cell-child");
  });
});
