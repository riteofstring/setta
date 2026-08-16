/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useItemSelectionMode } from "../../document/itemSelectionMode";
import { useSectionRefs } from "../../section/sectionRefs";
import {
  RotaryValueControl,
  type RotaryValueControlProps,
} from "./RotaryValueControl";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Ports the frozen rotary characterization and adds the package boundary cases: exact visual
// recipe, string commits, pointer capture, wheel ownership, host naming, focus restoration,
// explicit controlled-value parsing, and host/item-select disabledness.

const SECTION_ID = "panel";

describe("RotaryValueControl", () => {
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
    vi.restoreAllMocks();
  });

  async function mount(props: Partial<RotaryValueControlProps> = {}) {
    await act(async () => {
      root.render(
        <RotaryValueControl
          ariaLabel="Mix value"
          sectionId={SECTION_ID}
          value="0.5"
          min={0}
          max={1}
          step={0.1}
          onValueChange={() => {}}
          {...props}
        />,
      );
    });
  }

  function getKnob(): HTMLButtonElement {
    const knob = host.querySelector<HTMLButtonElement>('button[role="slider"]');
    if (!knob) {
      throw new Error("The rotary knob is not rendered.");
    }
    return knob;
  }

  function getWrapper(): HTMLElement {
    const wrapper = host.firstElementChild;
    if (!(wrapper instanceof HTMLElement)) {
      throw new Error("The rotary wrapper is not rendered.");
    }
    return wrapper;
  }

  function getKnobLayer(knob: HTMLButtonElement, index: number): HTMLElement {
    const layer = knob.children[index];
    if (!(layer instanceof HTMLElement)) {
      throw new Error(`The rotary knob is missing layer ${index}.`);
    }
    return layer;
  }

  function dispatchPointer(
    target: HTMLElement,
    type: "pointerdown" | "pointermove" | "pointerup",
    {
      pointerId,
      clientX,
      clientY,
    }: { pointerId: number; clientX: number; clientY: number },
  ): MouseEvent {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
    });
    Object.defineProperty(event, "pointerId", { value: pointerId });
    target.dispatchEvent(event);
    return event;
  }

  it("renders the reference 40 px knob, layers, indicator, and value presentation", async () => {
    await mount();
    const wrapper = getWrapper();
    expect(wrapper.className).toBe(
      "setta-prevent-section-active-css nodrag nopan section-value flex items-center gap-2",
    );
    expect(wrapper.classList.contains("nowheel")).toBe(false);
    const knob = getKnob();
    expect(knob.getAttribute("aria-label")).toBe("Mix value");
    expect(knob.getAttribute("aria-valuemin")).toBe("0");
    expect(knob.getAttribute("aria-valuemax")).toBe("1");
    expect(knob.getAttribute("aria-valuenow")).toBe("0.5");
    expect(knob.getAttribute("aria-valuetext")).toBe("0.5");
    expect(knob.dataset.settaWorkspaceTouchTarget).toBe("gesture");
    for (const expectedClass of [
      "nodrag",
      "nopan",
      "setta-manual-wheel",
      "h-10",
      "w-10",
      "touch-none",
      "rounded-full",
      "cursor-grab",
    ]) {
      expect(knob.classList.contains(expectedClass)).toBe(true);
    }
    expect(knob.children).toHaveLength(5);
    expect(getKnobLayer(knob, 0).classList.contains("bg-gradient-to-br")).toBe(
      true,
    );
    expect(getKnobLayer(knob, 1).classList.contains("inset-[5px]")).toBe(true);
    expect(getKnobLayer(knob, 2).classList.contains("inset-[10px]")).toBe(true);
    expect(getKnobLayer(knob, 3).style.transform).toBe("rotate(0deg)");
    expect(getKnobLayer(knob, 4).classList.contains("border-dashed")).toBe(
      true,
    );
    expect(wrapper.querySelector("span")?.textContent).toBe("0.5");
  });

  it.each([
    ["ArrowUp", "0.6"],
    ["ArrowRight", "0.6"],
    ["ArrowDown", "0.4"],
    ["ArrowLeft", "0.4"],
    ["Home", "0"],
    ["End", "1"],
  ])("maps %s to the reference stepped value", async (key, expectedValue) => {
    const onValueChange = vi.fn();
    await mount({ onValueChange });
    const event = new KeyboardEvent("keydown", {
      key,
      code: key,
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      getKnob().dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(onValueChange).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenCalledWith(expectedValue);
  });

  it("owns wheel adjustment and reports one step in the wheel direction", async () => {
    const onValueChange = vi.fn();
    await mount({ onValueChange });
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -1,
    });
    await act(async () => {
      getKnob().dispatchEvent(event);
    });
    // The manual-wheel boundary lets the canvas cancel browser history navigation synchronously.
    // React still owns the value update through its delegated listener.
    expect(onValueChange).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenCalledWith("0.6");
  });

  it("captures a pointer and maps its angle through the -135 to 135 degree range", async () => {
    const onValueChange = vi.fn();
    await mount({ onValueChange });
    const knob = getKnob();
    vi.spyOn(knob, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 40,
      bottom: 40,
      width: 40,
      height: 40,
      toJSON: () => ({}),
    });
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperties(knob, {
      setPointerCapture: { configurable: true, value: setPointerCapture },
      releasePointerCapture: {
        configurable: true,
        value: releasePointerCapture,
      },
    });

    let pointerDown: MouseEvent | undefined;
    await act(async () => {
      pointerDown = dispatchPointer(knob, "pointerdown", {
        pointerId: 7,
        clientX: 40,
        clientY: 20,
      });
      dispatchPointer(knob, "pointermove", {
        pointerId: 7,
        clientX: 20,
        clientY: 0,
      });
      dispatchPointer(knob, "pointerup", {
        pointerId: 7,
        clientX: 20,
        clientY: 0,
      });
    });
    expect(pointerDown?.defaultPrevented).toBe(true);
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onValueChange.mock.calls).toEqual([["0.5"], ["0.2"]]);
  });

  it("parses the controlled value like the reference and clamps it to the configured range", async () => {
    await mount({ value: "0.75suffix" });
    expect(getKnob().getAttribute("aria-valuenow")).toBe("0.75");
    await mount({ value: "20" });
    expect(getKnob().getAttribute("aria-valuenow")).toBe("1");
    await mount({ value: "malformed" });
    expect(getKnob().getAttribute("aria-valuenow")).toBe("0");
  });

  it("returns focus to the section on Escape", async () => {
    const sectionRoot = document.createElement("div");
    sectionRoot.tabIndex = -1;
    document.body.appendChild(sectionRoot);
    useSectionRefs.setState({ withNested: { [SECTION_ID]: sectionRoot } });
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    await mount();
    await act(async () => {
      getKnob().dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          bubbles: true,
        }),
      );
    });
    expect(document.activeElement).toBe(sectionRoot);
    expect(documentEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", documentEscape);
    sectionRoot.remove();
  });

  it("disables from the host flag and item-select mode without reporting interaction", async () => {
    const onValueChange = vi.fn();
    await mount({ disabled: true, onValueChange });
    expect(getKnob().disabled).toBe(true);
    expect(getKnob().classList.contains("cursor-not-allowed")).toBe(true);
    expect(getKnob().classList.contains("opacity-50")).toBe(true);
    expect(getKnob().classList.contains("nowheel")).toBe(false);
    expect(getKnob().classList.contains("setta-manual-wheel")).toBe(false);
    await act(async () => {
      getKnob().dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaY: -1,
        }),
      );
    });
    expect(onValueChange).not.toHaveBeenCalled();

    useItemSelectionMode.setState({ isSelectingItems: true });
    await mount({ disabled: false });
    expect(getKnob().disabled).toBe(true);
    expect(getKnob().classList.contains("nowheel")).toBe(false);
    expect(getKnob().classList.contains("setta-manual-wheel")).toBe(false);
  });
});
