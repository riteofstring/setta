import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ComboboxInput } from "./ComboboxParts";

const inputRef = createRef<HTMLInputElement>();

function renderInputMarkup(variant: "pill" | "pane", isOpen = false) {
  return renderToStaticMarkup(
    <ComboboxInput
      divId="combobox-test"
      getInputProps={() => ({})}
      getToggleButtonProps={() => ({})}
      isOpen={isOpen}
      small={true}
      onKeyDown={() => {}}
      placeholder="Pick one"
      bg=""
      isDisabled={false}
      inputRef={inputRef}
      variant={variant}
    />,
  );
}

function renderNormalInputMarkup(variant: "pill" | "pane", isOpen = false) {
  return renderToStaticMarkup(
    <ComboboxInput
      divId="combobox-test-normal"
      getInputProps={() => ({})}
      getToggleButtonProps={() => ({})}
      isOpen={isOpen}
      small={false}
      onKeyDown={() => {}}
      placeholder="Pick one"
      bg=""
      isDisabled={false}
      inputRef={inputRef}
      variant={variant}
    />,
  );
}

describe("ComboboxInput", () => {
  it("uses full-height small toggle sizing for pane variants", () => {
    // Pane comboboxes use a compact 24px field; the chevron button should
    // match that compact height instead of rendering shorter.
    const markup = renderInputMarkup("pane");
    expect(markup).toContain("h-6 w-6");
  });

  it("keeps compact toggle sizing for pill variants", () => {
    // Pill variant keeps the existing tighter small toggle.
    const markup = renderInputMarkup("pill");
    expect(markup).toContain("h-4 w-4");
    expect(markup).toContain("pr-6");
  });

  it("uses full-height normal toggle sizing for pill variants", () => {
    // The default pill combobox should not render a visibly shorter chevron button.
    const markup = renderNormalInputMarkup("pill");
    expect(markup).toContain("h-7 w-7");
    expect(markup).toContain("pr-8");
  });

  it("renders combobox chevrons on the button host without icon child nodes", () => {
    // Chevron shape is rendered through pseudo-elements on the existing host button.
    const paneMarkup = renderInputMarkup("pane");
    const pillMarkup = renderInputMarkup("pill");

    expect(paneMarkup).toContain('data-combobox-chevron-host="true"');
    expect(pillMarkup).toContain('data-combobox-chevron-host="true"');
    expect(paneMarkup).toContain("before:border-r-[1.5px]");
    expect(pillMarkup).toContain("before:border-b-[1.5px]");
    expect(paneMarkup).not.toContain("<svg");
    expect(pillMarkup).not.toContain("<svg");
    expect(paneMarkup).not.toContain("gg-chevron-down");
    expect(pillMarkup).not.toContain("gg-chevron-down");
  });

  it("rotates host chevrons by open state", () => {
    const closedMarkup = renderNormalInputMarkup("pill", false);
    const openMarkup = renderNormalInputMarkup("pill", true);

    expect(closedMarkup).toContain("before:rotate-45");
    expect(closedMarkup).toContain("before:-translate-y-[1px]");
    expect(openMarkup).toContain("before:-rotate-[135deg]");
    expect(openMarkup).toContain("before:translate-y-[1px]");
  });

  it("renders the toggle button without a right wrapper container", () => {
    // The combobox toggle now owns absolute positioning to avoid an extra wrapper node.
    const markup = renderInputMarkup("pill");
    expect(markup).not.toContain(
      "absolute inset-y-0 right-0 grid select-none place-items-center",
    );
    expect(markup).toContain("absolute inset-y-0 right-1");
    expect(markup).not.toContain("undefined");
  });
});
