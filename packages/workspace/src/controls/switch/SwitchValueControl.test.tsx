/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useItemSelectionMode } from "../../document/itemSelectionMode";
import { useSectionRefs } from "../../section/sectionRefs";
import { SwitchValueControl, type SwitchValueControlProps } from "./SwitchValueControl";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Freezes the boolean switch against the reference `SwitchInput` at the `ParamUI` switch
// presentation: the recorded Radix geometry and paint classes, the reference's checked parse
// across the string seam, the stringified boolean commit, Escape returning focus to the
// section without unselecting it, and the interaction-first disabled contract for the host
// flag and item-select mode.

const SECTION_ID = "panel";

describe("SwitchValueControl", () => {
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

  async function mount(props: Partial<SwitchValueControlProps> = {}) {
    await act(async () => {
      root.render(
        createElement(SwitchValueControl, {
          ariaLabel: "Enabled value",
          sectionId: SECTION_ID,
          value: "true",
          onValueChange: () => {},
          ...props,
        }),
      );
    });
  }

  function getSwitch(): HTMLButtonElement {
    const switchButton = host.querySelector<HTMLButtonElement>('button[role="switch"]');
    if (!switchButton) {
      throw new Error("The switch control is not rendered.");
    }
    return switchButton;
  }

  it("renders the reference switch presentation inside the value-column wrapper", async () => {
    await mount();
    const wrapper = host.firstElementChild;
    expect(wrapper?.className).toBe("section-value flex justify-self-start self-center");
    const switchButton = getSwitch();
    expect(switchButton.getAttribute("aria-label")).toBe("Enabled value");
    // The recorded geometry: 10 px track and thumb (h-2.5/w-2.5), 3.2 px padding
    // (p-[0.2rem]), full radius, blue-500/dark blue-700 checked paint, 16 px checked thumb
    // translation (translate-x-4), and the no-drag boundary.
    for (const expectedClass of [
      "nodrag",
      "setta-workspace-native-reset",
      "h-2.5",
      "w-7",
      "min-w-7",
      "rounded-full",
      "p-[0.2rem]",
      "!bg-setta-400",
      "data-[state='checked']:!bg-blue-500",
      "dark:!bg-setta-600",
      "dark:data-[state='checked']:!bg-blue-700",
      "disabled:pointer-events-none",
    ]) {
      expect(switchButton.classList.contains(expectedClass)).toBe(true);
    }
    const thumb = switchButton.firstElementChild;
    for (const expectedClass of [
      "h-2.5",
      "w-2.5",
      "rounded-full",
      "motion-safe:transition-all",
      "data-[state='checked']:translate-x-4",
      "rtl:data-[state='checked']:-translate-x-4",
      "bg-white",
      "dark:bg-setta-800",
    ]) {
      expect(thumb?.classList.contains(expectedClass)).toBe(true);
    }
    expect(switchButton.dataset.settaWorkspaceTouchTarget).toBe("expanded");
  });

  it("parses only the string form of the reference checked contract", async () => {
    await mount({ value: "true" });
    expect(getSwitch().dataset.state).toBe("checked");
    await mount({ value: "false" });
    expect(getSwitch().dataset.state).toBe("unchecked");
    await mount({ value: "True" });
    expect(getSwitch().dataset.state).toBe("unchecked");
  });

  it("reports one stringified boolean commit per toggle", async () => {
    const onValueChange = vi.fn();
    await mount({ value: "true", onValueChange });
    await act(async () => {
      getSwitch().click();
    });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("false");
  });

  it("returns focus to the section on Escape without letting the event bubble", async () => {
    const sectionRoot = document.createElement("div");
    sectionRoot.tabIndex = -1;
    document.body.appendChild(sectionRoot);
    useSectionRefs.setState({ withNested: { [SECTION_ID]: sectionRoot } });
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    await mount();
    await act(async () => {
      getSwitch().dispatchEvent(
        new KeyboardEvent("keydown", { code: "Escape", key: "Escape", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(sectionRoot);
    expect(documentEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", documentEscape);
    sectionRoot.remove();
  });

  it("disables from the host flag and ignores toggles", async () => {
    const onValueChange = vi.fn();
    await mount({ disabled: true, onValueChange });
    expect(getSwitch().disabled).toBe(true);
    await act(async () => {
      getSwitch().click();
    });
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("disables package-wide during item-select mode", async () => {
    useItemSelectionMode.setState({ isSelectingItems: true });
    await mount();
    expect(getSwitch().disabled).toBe(true);
  });
});
