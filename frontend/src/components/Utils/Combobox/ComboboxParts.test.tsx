import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CanvasOwnedRestingComboboxInput,
  ComboboxInput,
} from "./ComboboxParts";

const inputRef = createRef<HTMLInputElement>();

function renderInputMarkup(variant: "pill" | "pane") {
  return renderToStaticMarkup(
    <ComboboxInput
      divId="combobox-test"
      getInputProps={() => ({})}
      getToggleButtonProps={() => ({})}
      isOpen={false}
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

function renderNormalInputMarkup(variant: "pill" | "pane") {
  return renderToStaticMarkup(
    <ComboboxInput
      divId="combobox-test-normal"
      getInputProps={() => ({})}
      getToggleButtonProps={() => ({})}
      isOpen={false}
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

function renderInputMarkupWithUndefinedBg(variant: "pill" | "pane") {
  return renderToStaticMarkup(
    <ComboboxInput
      divId="combobox-test-undefined-bg"
      getInputProps={() => ({})}
      getToggleButtonProps={() => ({})}
      isOpen={false}
      small={false}
      onKeyDown={() => {}}
      placeholder="Pick one"
      bg={undefined}
      isDisabled={false}
      inputRef={inputRef}
      variant={variant}
    />,
  );
}

function renderCanvasOwnedRestingInputMarkup(variant: "pill" | "pane") {
  return renderToStaticMarkup(
    <CanvasOwnedRestingComboboxInput
      displayText="any"
      divId="combobox-test-canvas-owned"
      onFocus={() => {}}
      onMouseDownCapture={() => {}}
      placeholder="Pick one"
      small={true}
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

  it("uses svg chevron icons instead of gg chevron classes", () => {
    // SVG chevrons keep optical centering stable across both variants.
    const paneMarkup = renderInputMarkup("pane");
    const pillMarkup = renderInputMarkup("pill");

    expect(paneMarkup).not.toContain("gg-chevron-down");
    expect(pillMarkup).not.toContain("gg-chevron-down");
    expect(pillMarkup).toContain("<svg");
  });

  it("falls back to the variant background when bg is undefined", () => {
    const paneMarkup = renderInputMarkupWithUndefinedBg("pane");
    const pillMarkup = renderInputMarkupWithUndefinedBg("pill");

    expect(paneMarkup).toContain("bg-white/80");
    expect(pillMarkup).toContain("bg-white");
  });

  it("renders lightweight canvas-owned resting combobox markup without a live input", () => {
    const markup = renderCanvasOwnedRestingInputMarkup("pill");

    expect(markup).toContain(
      'data-canvas-owned-resting-dropdown-lightweight="true"',
    );
    expect(markup).toContain('data-canvas-owned-resting-dropdown-box="true"');
    expect(markup).toContain('data-canvas-owned-resting-text="true"');
    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("<button");
  });
});
