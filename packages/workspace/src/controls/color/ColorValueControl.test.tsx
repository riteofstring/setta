/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialCanvasState, useReactFlow } from "../../canvas/store";
import { useItemSelectionMode } from "../../document/itemSelectionMode";
import { useSectionRefs } from "../../section/sectionRefs";
import { ColorValueControl, type ColorValueControlProps } from "./ColorValueControl";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Freezes the color control against the reference `ColorPickerInput` at the `ParamUI` color
// presentation: the configured-choice trigger over the portaled 16 px swatch listbox, the
// native-input path behind the eyedropper glyph, single-report cadence through the string
// seam, Escape returning focus to the section, canvas-transform repositioning for the open
// popover, and the interaction-first disabled contract.

const SECTION_ID = "panel";
const ITEM_ID = "item-accent";
const NATIVE_INPUT_ID = `${SECTION_ID}-${ITEM_ID}-ColorValueInput`;

// The captured evidence fixture's choices (Red/Green/Blue).
const CHOICES = [
  { color: "#ef4444", description: "Red" },
  { color: "#22c55e", description: "Green" },
  { color: "#3b82f6", description: "Blue" },
];

describe("ColorValueControl", () => {
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
    useReactFlow.setState({ ...initialCanvasState });
  });

  async function mount(props: Partial<ColorValueControlProps> = {}) {
    await act(async () => {
      root.render(
        createElement(ColorValueControl, {
          ariaLabel: "Accent color",
          sectionId: SECTION_ID,
          itemId: ITEM_ID,
          value: "#22c55e",
          onValueChange: () => {},
          ...props,
        }),
      );
    });
  }

  function getTrigger(): HTMLButtonElement {
    const trigger = host.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]');
    if (!trigger) {
      throw new Error("The configured color trigger is not rendered.");
    }
    return trigger;
  }

  async function openPopover() {
    await act(async () => {
      getTrigger().dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  async function flushAnimationFrame() {
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
  }

  it("renders the configured trigger with the reference presentation", async () => {
    await mount({ choices: CHOICES });
    const wrapper = host.firstElementChild;
    // The ParamUI wrapper literal plus the package no-drag boundary.
    for (const expectedClass of [
      "nodrag",
      "section-value",
      "single-cell-container",
      "w-[calc(100%_-_2px)]",
      "h-[calc(100%_-_4px)]",
      "justify-self-start",
      "self-center",
    ]) {
      expect(wrapper?.classList.contains(expectedClass)).toBe(true);
    }
    const trigger = getTrigger();
    expect(trigger.getAttribute("aria-label")).toBe("Accent color: Green");
    for (const expectedClass of ["flex-1", "rounded-lg", "single-cell-container", "text-white"]) {
      expect(trigger.classList.contains(expectedClass)).toBe(true);
    }
    // The rounded swatch paints the selected choice; the label and chevron ride the
    // auto-contrast layer.
    const swatch = trigger.querySelector<HTMLElement>("div.single-cell-child.rounded-lg");
    expect(swatch?.style.backgroundColor).toBe("rgb(34, 197, 94)");
    expect(trigger.querySelector("p")?.textContent).toBe("Green");
    expect(trigger.querySelector("i.gg-chevron-down")).not.toBeNull();
  });

  it("falls back to the first choice when the value matches none", async () => {
    await mount({ choices: CHOICES, value: "#000000" });
    expect(getTrigger().querySelector("p")?.textContent).toBe("Red");
  });

  it("opens the listbox and reports one selection before closing", async () => {
    const onValueChange = vi.fn();
    await mount({ choices: CHOICES, onValueChange });
    await openPopover();
    const listbox = document.querySelector('[role="listbox"]');
    expect(listbox?.getAttribute("aria-label")).toBe("Accent color choices");
    expect(listbox?.parentElement?.classList.contains("setta-workspace")).toBe(true);
    const options = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
    expect(options.map((option) => option.textContent)).toEqual(["Red", "Green", "Blue"]);
    // The recorded 16 px round swatch inside each option row.
    const optionSwatch = options[0]?.querySelector<HTMLElement>("div.h-4.w-4.rounded-full");
    expect(optionSwatch?.style.backgroundColor).toBe("rgb(239, 68, 68)");
    const blueOption = options.find((option) => option.textContent === "Blue");
    await act(async () => {
      blueOption?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("#3b82f6");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("repositions the open popover when the canvas transform changes", async () => {
    await mount({ choices: CHOICES });
    await openPopover();
    // Flush the open-time reposition frame before observing the transform-driven one.
    await flushAnimationFrame();
    const onScroll = vi.fn();
    const onResize = vi.fn();
    window.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onResize);
    act(() => {
      useReactFlow.setState({ transform: [12, -4, 1.5] });
    });
    await flushAnimationFrame();
    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenCalledTimes(1);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
  });

  it("returns focus to the section on trigger Escape without letting the event bubble", async () => {
    const sectionRoot = document.createElement("div");
    sectionRoot.tabIndex = -1;
    document.body.appendChild(sectionRoot);
    useSectionRefs.setState({ withNested: { [SECTION_ID]: sectionRoot } });
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    await mount({ choices: CHOICES });
    await act(async () => {
      getTrigger().dispatchEvent(
        new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(sectionRoot);
    expect(documentEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", documentEscape);
    sectionRoot.remove();
  });

  it("disables the configured trigger from the host flag and item-select mode", async () => {
    await mount({ choices: CHOICES, disabled: true });
    expect(getTrigger().disabled).toBe(true);
    useItemSelectionMode.setState({ isSelectingItems: true });
    await mount({ choices: CHOICES });
    expect(getTrigger().disabled).toBe(true);
  });

  it("renders the native path behind the eyedropper glyph without choices", async () => {
    await mount({ value: "#afbacf" });
    expect(host.querySelector("i.gg-color-picker.single-cell-child")).not.toBeNull();
    const input = host.querySelector<HTMLInputElement>('input[type="color"]');
    if (!input) {
      throw new Error("The native color input is not rendered.");
    }
    expect(input.id).toBe(NATIVE_INPUT_ID);
    expect(input.value).toBe("#afbacf");
    expect(input.getAttribute("aria-label")).toBe("Accent color");
    for (const expectedClass of [
      "setta-workspace-native-reset",
      "single-cell-child",
      "!rounded-lg",
      "!border",
      "!border-setta-500/20",
      "dark:!border-setta-500/40",
      "cursor-pointer",
    ]) {
      expect(input.classList.contains(expectedClass)).toBe(true);
    }
  });

  it("reports each native input gesture once through the string seam", async () => {
    const onValueChange = vi.fn();
    await mount({ value: "#afbacf", onValueChange });
    const input = host.querySelector<HTMLInputElement>('input[type="color"]');
    if (!input) {
      throw new Error("The native color input is not rendered.");
    }
    const setNativeValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!setNativeValue) {
      throw new Error("The native input value setter is unavailable.");
    }
    await act(async () => {
      setNativeValue.call(input, "#123456");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("#123456");
  });

  it("disables the native input from the host flag", async () => {
    await mount({ disabled: true });
    expect(host.querySelector<HTMLInputElement>('input[type="color"]')?.disabled).toBe(true);
  });
});
