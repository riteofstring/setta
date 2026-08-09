/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useItemSelectionMode } from "../../document/itemSelectionMode";
import { useWorkspaceAppearance } from "../../document/stores";
import { MetaControl, type MetaControlProps } from "./MetaControl";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REFERENCE_BUTTON_CLASS_NAME =
  "nodrag nopan flex h-full min-h-8 w-full items-center justify-center rounded-lg border border-setta-600 bg-setta-600 px-3 text-xs font-semibold text-white shadow-sm transition-all hover:border-setta-700 hover:bg-setta-700 active:translate-y-[2px] active:scale-[0.96] active:bg-setta-700 active:shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 dark:border-setta-500 dark:bg-setta-700 dark:text-setta-50 dark:hover:border-setta-400 dark:hover:bg-setta-600 dark:active:bg-setta-600 cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-60";
const REFERENCE_TEXT_WRAPPER_CLASS_NAME =
  "nodrag nopan single-cell-container h-full min-h-0 w-full min-w-0 rounded-lg border border-setta-300/70 bg-setta-50 text-[11px] font-mono text-setta-700 dark:border-setta-700 dark:bg-setta-850 dark:text-setta-200";

describe("MetaControl", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    useItemSelectionMode.getState().reset();
    useWorkspaceAppearance.getState().reset();
  });

  async function mount(props: MetaControlProps) {
    await act(async () => root.render(createElement(MetaControl, props)));
  }

  it("renders the full-area controlled Button with the frozen classes and optional title", async () => {
    const onAction = vi.fn();
    await mount({
      sectionId: "meta-button",
      sectionName: "Run model",
      showSectionTitle: true,
      control: { kind: "button", label: "Trigger", onAction },
    });

    expect(host.firstElementChild?.className).toBe(
      "col-span-full row-span-full flex h-full w-full items-stretch p-0",
    );
    const title = host.querySelector("span");
    expect(title?.textContent).toBe("Run model");
    expect(title?.className).toContain("text-[10px] uppercase tracking-[0.2em]");
    const button = host.querySelector("button");
    if (!button) {
      throw new Error("The Button meta control did not render its action.");
    }
    expect(button.textContent).toBe("Trigger");
    expect(button.className).toBe(REFERENCE_BUTTON_CLASS_NAME);
    await act(async () => button.click());
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("disables the Button for host pending state and package item-select mode", async () => {
    const onAction = vi.fn();
    await mount({
      sectionId: "meta-button",
      sectionName: "Button",
      control: { kind: "button", label: "Trigger", pending: true, onAction },
    });
    let button = host.querySelector("button");
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute("aria-busy")).toBe("true");
    button?.click();
    expect(onAction).not.toHaveBeenCalled();

    await act(async () => useItemSelectionMode.setState({ isSelectingItems: true }));
    await mount({
      sectionId: "meta-button",
      sectionName: "Button",
      control: { kind: "button", label: "Trigger", onAction },
    });
    button = host.querySelector("button");
    expect(button?.disabled).toBe(true);
  });

  it("composes the two-layer Text editor in the frozen full-area wrapper", async () => {
    await mount({
      sectionId: "meta-text",
      sectionName: "Text",
      control: {
        kind: "text",
        controlId: "value",
        ariaLabel: "Text value",
        value: "threshold",
        onValueChange: () => {},
      },
    });

    const dummy = document.getElementById("meta-text-value-MetaControl");
    expect(dummy?.getAttribute("role")).toBe("textbox");
    expect(dummy?.getAttribute("aria-label")).toBe("Text value");
    expect(dummy?.textContent).toBe("threshold");
    expect(dummy?.className).toContain(
      "single-cell-child section-value block h-full w-full min-w-0 break-words px-3 py-2 leading-[1.4]",
    );
    expect(dummy?.parentElement?.className).toBe(REFERENCE_TEXT_WRAPPER_CLASS_NAME);
    expect(host.querySelector("span.section-value")).toBeNull();
  });

  it("fails specifically instead of rendering an unknown control fallback", () => {
    expect(() =>
      MetaControl({
        sectionId: "meta-unknown",
        sectionName: "Unknown",
        control: { kind: "mystery" } as never,
      }),
    ).toThrowError("Unknown meta control kind: mystery.");
  });
});
