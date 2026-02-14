import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComboboxInput } from "./ComboboxParts";

describe("ComboboxInput compact chevron sizing", () => {
  it("uses a snug, centered chevron button in small pane variant", () => {
    const markup = renderToStaticMarkup(
      <ComboboxInput
        divId="test-combobox"
        getInputProps={() => ({})}
        getToggleButtonProps={() => ({})}
        isOpen={false}
        small
        onKeyDown={() => {}}
        placeholder="Select"
        isDisabled={false}
        inputRef={{ current: null }}
        variant="pane"
      />,
    );

    expect(markup).toContain("h-4 w-4");
    expect(markup).toContain("mr-1");
    expect(markup).toContain("--ggs:0.42");
  });
});
