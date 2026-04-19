import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ColorPickerInput } from "./ColorPickerInput";

describe("ColorPickerInput", () => {
  it("renders a listbox trigger when color choices are available", () => {
    const markup = renderToStaticMarkup(
      <ColorPickerInput
        colorChoices={[
          { color: "#ef4444", description: "Red" },
          { color: "#3b82f6", description: "Blue" },
        ]}
        value="#ef4444"
        onChange={() => undefined}
        wrapperClassName="h-8 w-36"
        colorPickerChoicesClasses="flex h-8 w-36 items-center rounded-lg"
      />,
    );

    expect(markup).toContain('aria-haspopup="listbox"');
    expect(markup).toContain("Red");
  });

  it("reuses the value-shell wrapper as the lightweight color root on the canvas path", () => {
    const markup = renderToStaticMarkup(
      <ColorPickerInput
        colorChoices={[]}
        lightweightActivator={true}
        value="#ef4444"
        onChange={() => undefined}
        wrapperClassName="section-value single-cell-container h-8 w-36"
        colorPickerChoicesClasses="flex h-8 w-36 items-center rounded-lg"
      />,
    );

    expect(markup).toContain('data-canvas-owned-lightweight-color-input="true"');
    expect(markup.match(/section-value/g)).toHaveLength(1);
    expect(markup).toContain("gg-color-picker");
    expect(markup).not.toContain('type="color"');
  });
});
