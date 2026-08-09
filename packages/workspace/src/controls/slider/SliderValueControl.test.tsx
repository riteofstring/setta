/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useItemSelectionMode } from "../../document/itemSelectionMode";
import { useSectionRefs } from "../../section/sectionRefs";
import { SliderValueControl, type SliderValueControlProps } from "./SliderValueControl";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Freezes the package slider against the ordinary-row `SliderInput`: its exact class recipe,
// Radix stepping and commit cadence, temporary numeric field parsing/clamping, Escape focus,
// string seam, accessible names, and host/item-select disabledness.

const SECTION_ID = "panel";

describe("SliderValueControl", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    useItemSelectionMode.getState().reset();
    useSectionRefs.getState().reset();
  });

  async function mount(props: Partial<SliderValueControlProps> = {}) {
    await act(async () => {
      root.render(
        <SliderValueControl
          ariaLabel="Gain value"
          sectionId={SECTION_ID}
          value="5"
          min={0}
          max={10}
          step={1}
          onValueChange={() => {}}
          {...props}
        />,
      );
    });
  }

  function getWrapper(): HTMLDivElement {
    const wrapper = host.firstElementChild;
    if (!(wrapper instanceof HTMLDivElement)) {
      throw new Error("The slider wrapper is not rendered.");
    }
    return wrapper;
  }

  function getThumb(): HTMLElement {
    const thumb = host.querySelector<HTMLElement>('[role="slider"]');
    if (!thumb) {
      throw new Error("The slider thumb is not rendered.");
    }
    return thumb;
  }

  function getNumericInput(): HTMLInputElement {
    const input = host.querySelector<HTMLInputElement>(
      'input[aria-label="Gain value numeric value"]',
    );
    if (!input) {
      throw new Error("The slider numeric input is not rendered.");
    }
    return input;
  }

  it("renders the reference row presentation inside the package interaction boundary", async () => {
    await mount();
    expect(getWrapper().className).toBe(
      "setta-prevent-section-active-css nodrag nopan cursor-pointer @container/slider section-value flex gap-1",
    );
    const sliderRoot = getWrapper().firstElementChild;
    if (!(sliderRoot instanceof HTMLElement)) {
      throw new Error("The Radix slider root is not rendered.");
    }
    expect(sliderRoot.dataset.settaWorkspaceTouchTarget).toBe("gesture-inline");
    for (const expectedClass of [
      "SliderRoot",
      "relative",
      "flex",
      "w-full",
      "touch-none",
      "select-none",
      "items-center",
      "data-[orientation='horizontal']:h-5",
    ]) {
      expect(sliderRoot.classList.contains(expectedClass)).toBe(true);
    }
    const track = sliderRoot.firstElementChild;
    expect(track?.classList.contains("data-[orientation='horizontal']:h-[3px]")).toBe(true);
    expect(track?.classList.contains("bg-setta-200")).toBe(true);
    expect(track?.firstElementChild?.classList.contains("bg-blue-500")).toBe(true);
    const thumb = getThumb();
    expect(thumb.getAttribute("aria-label")).toBe("Gain value");
    expect(thumb.getAttribute("aria-valuemin")).toBe("0");
    expect(thumb.getAttribute("aria-valuemax")).toBe("10");
    expect(thumb.getAttribute("aria-valuenow")).toBe("5");
    for (const expectedClass of [
      "nodrag",
      "h-3",
      "w-3",
      "rounded-full",
      "border-2",
      "drop-shadow-md",
      "focus-visible:!border-blue-500",
      "data-[disabled]:pointer-events-none",
    ]) {
      expect(thumb.classList.contains(expectedClass)).toBe(true);
    }
    const input = getNumericInput();
    expect(input.inputMode).toBe("decimal");
    for (const expectedClass of [
      "hidden",
      "rounded-lg",
      "font-mono",
      "text-xs",
      "tabular-nums",
      "@[132px]/slider:!block",
    ]) {
      expect(input.classList.contains(expectedClass)).toBe(true);
    }
    expect(input.style.inlineSize).toBe("calc(2ch + 2px + 1rem)");
  });

  it("reserves a stable numeric width from the configured range and precision", async () => {
    await mount({ value: "9", min: 0, max: 100, step: 1 });
    expect(getNumericInput().style.inlineSize).toBe("calc(3ch + 2px + 1rem)");

    await mount({ value: "100", min: 0, max: 100, step: 1 });
    expect(getNumericInput().style.inlineSize).toBe("calc(3ch + 2px + 1rem)");

    await mount({ value: "-9.75", min: -10, max: 10, step: 0.25 });
    expect(getNumericInput().style.inlineSize).toBe("calc(6ch + 2px + 1rem)");
  });

  it("reports Radix keyboard changes and their end-of-gesture commit as strings", async () => {
    const onValueChange = vi.fn();
    const onValueCommit = vi.fn();
    await mount({ onValueChange, onValueCommit });
    const keyDown = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      code: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      getThumb().dispatchEvent(keyDown);
    });
    expect(keyDown.defaultPrevented).toBe(true);
    expect(onValueChange).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenCalledWith("6");

    // Reproduce the controlled host accepting the live change before Radix closes the keyboard
    // gesture on keyup.
    await mount({ value: "6", onValueChange, onValueCommit });
    await act(async () => {
      getThumb().dispatchEvent(
        new KeyboardEvent("keyup", { key: "ArrowRight", code: "ArrowRight", bubbles: true }),
      );
    });
    expect(onValueCommit).toHaveBeenCalledOnce();
    expect(onValueCommit).toHaveBeenCalledWith("6");
  });

  it("clamps a finite numeric-field edit and reports one change and one commit on blur", async () => {
    const onValueChange = vi.fn();
    const onValueCommit = vi.fn();
    await mount({ onValueChange, onValueCommit });
    const input = getNumericInput();
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!valueSetter) {
      throw new Error("The native input value setter is unavailable.");
    }
    await act(async () => {
      valueSetter.call(input, "12");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(input.value).toBe("10");
    expect(onValueChange).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenCalledWith("10");
    expect(onValueCommit).toHaveBeenCalledOnce();
    expect(onValueCommit).toHaveBeenCalledWith("10");
  });

  it("reverts an empty or non-finite numeric-field edit without reporting it", async () => {
    const onValueChange = vi.fn();
    const onValueCommit = vi.fn();
    await mount({ onValueChange, onValueCommit });
    const input = getNumericInput();
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!valueSetter) {
      throw new Error("The native input value setter is unavailable.");
    }
    await act(async () => {
      valueSetter.call(input, "not-a-number");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(input.value).toBe("5");
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onValueCommit).not.toHaveBeenCalled();
  });

  it("clamps a finite controlled value and positions malformed input at min", async () => {
    await mount({ value: "50" });
    expect(getThumb().getAttribute("aria-valuenow")).toBe("10");
    await mount({ value: "malformed" });
    expect(getThumb().getAttribute("aria-valuenow")).toBe("0");
  });

  it("returns focus to the section when Escape starts from either editable surface", async () => {
    const sectionRoot = document.createElement("div");
    sectionRoot.tabIndex = -1;
    document.body.appendChild(sectionRoot);
    useSectionRefs.setState({ withNested: { [SECTION_ID]: sectionRoot } });
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    await mount();
    for (const target of [getThumb(), getNumericInput()]) {
      await act(async () => {
        target.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
        );
      });
      expect(document.activeElement).toBe(sectionRoot);
    }
    expect(documentEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", documentEscape);
    sectionRoot.remove();
  });

  it("disables both surfaces from the host flag and item-select mode", async () => {
    await mount({ disabled: true });
    expect(getThumb().getAttribute("data-disabled")).toBe("");
    expect(getNumericInput().disabled).toBe(true);

    useItemSelectionMode.setState({ isSelectingItems: true });
    await mount({ disabled: false });
    expect(getThumb().getAttribute("data-disabled")).toBe("");
    expect(getNumericInput().disabled).toBe(true);
  });
});
