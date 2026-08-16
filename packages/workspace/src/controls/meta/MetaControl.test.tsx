/* @vitest-environment jsdom */
import { beforeEach as beforeEachWorkspaceTestHost } from "vitest";
import { createWorkspaceTestHost, type WorkspaceTestHost, WorkspaceTestProvider } from "../../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});


import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useItemSelectionMode } from "../../document/itemSelectionMode";
import { useWorkspaceAppearance } from "../../document/stores";
import { useSectionRefs } from "../../section/sectionRefs";
import { MetaControl, type MetaControlProps } from "./MetaControl";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const REFERENCE_BUTTON_CLASS_NAME =
  "nodrag nopan flex h-full min-h-8 w-full items-center justify-center rounded-lg border border-setta-600 bg-setta-600 px-3 text-xs font-semibold text-white shadow-sm motion-safe:transition-all hover:border-setta-700 hover:bg-setta-700 motion-safe:active:translate-y-[2px] motion-safe:active:scale-[0.96] active:bg-setta-700 active:shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 dark:border-setta-500 dark:bg-setta-700 dark:text-setta-50 dark:hover:border-setta-400 dark:hover:bg-setta-600 dark:active:bg-setta-600 cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-60";
const REFERENCE_TEXT_WRAPPER_CLASS_NAME =
  "nodrag nopan single-cell-container h-full min-h-0 w-full min-w-0 rounded-lg border border-setta-300/70 bg-setta-50 text-[11px] font-mono text-setta-700 focus-within:border-blue-400 dark:border-setta-700 dark:bg-setta-850 dark:text-setta-200";

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
    testWorkspace.itemSelectionMode.getState().reset();
    testWorkspace.appearance.getState().reset();
    testWorkspace.sectionRefs.getState().reset();
  });

  it("returns focus from the Button control to its section on Escape", async () => {
    const sectionRoot = document.createElement("div");
    sectionRoot.tabIndex = -1;
    document.body.appendChild(sectionRoot);
    testWorkspace.sectionRefs.setState({ withNested: { "meta-button": sectionRoot } });
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    await mount({
      sectionId: "meta-button",
      sectionName: "Button",
      control: { kind: "button", label: "Trigger", onAction: () => {} },
    });
    const button = host.querySelector("button");
    button?.focus();
    await act(async () => {
      button?.dispatchEvent(
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

  async function mount(props: MetaControlProps) {
    await act(async () => root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {createElement(MetaControl, props)
        }</WorkspaceTestProvider>,
      ));
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
    expect(title?.className).toContain(
      "text-[10px] uppercase tracking-[0.2em]",
    );
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

    await act(async () =>
      testWorkspace.itemSelectionMode.setState({ isSelectingItems: true }),
    );
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

    const dummy = host.querySelector<HTMLElement>(
      `#${testWorkspace.domId}-meta-text-value-MetaControl`,
    );
    expect(dummy?.getAttribute("role")).toBe("textbox");
    expect(dummy?.getAttribute("aria-label")).toBe("Text value");
    expect(dummy?.textContent).toBe("threshold");
    expect(dummy?.className).toContain(
      "single-cell-child section-value block h-full w-full min-w-0 break-words px-3 py-2 leading-[1.4]",
    );
    expect(dummy?.parentElement?.className).toBe(
      REFERENCE_TEXT_WRAPPER_CLASS_NAME,
    );
    expect(host.querySelector("span.section-value")).toBeNull();
  });

  it("dispatches Slider and Rotary through their enlarged numeric presentations", async () => {
    await mount({
      sectionId: "meta-slider",
      sectionName: "Slider",
      control: {
        kind: "slider",
        ariaLabel: "Slider value",
        value: "25",
        min: 0,
        max: 100,
        step: 1,
        onValueChange: () => {},
      },
    });
    const slider = host.querySelector<HTMLElement>("[role='slider']");
    expect(slider?.getAttribute("aria-label")).toBe("Slider value");
    expect(slider?.closest(".SliderRoot")?.className).toContain(
      "w-full flex-1",
    );
    expect(host.querySelector<HTMLInputElement>("input")?.className).toBe(
      "hidden",
    );

    await mount({
      sectionId: "meta-rotary",
      sectionName: "Rotary",
      control: {
        kind: "rotary",
        ariaLabel: "Rotary value",
        value: "0.5",
        min: 0,
        max: 1,
        step: 0.1,
        onValueChange: () => {},
      },
    });
    const rotary = host.querySelector<HTMLElement>("[role='slider']");
    expect(rotary?.getAttribute("aria-label")).toBe("Rotary value");
    expect(rotary?.parentElement?.parentElement?.className).toContain(
      "justify-center",
    );
  });

  it("dispatches Switch, Dropdown, and Color with the frozen meta wrappers", async () => {
    await mount({
      sectionId: "meta-switch",
      sectionName: "Switch",
      control: {
        kind: "switch",
        ariaLabel: "Switch value",
        label: "thick_otter",
        value: "false",
        onValueChange: () => {},
      },
    });
    expect(host.textContent).toContain("thick_otter");
    const switchControl = host.querySelector("[role='switch']");
    expect(switchControl?.getAttribute("aria-label")).toBe("Switch value");
    expect(switchControl?.parentElement?.className).toContain(
      "nodrag section-value",
    );

    await mount({
      sectionId: "meta-dropdown",
      sectionName: "Dropdown",
      control: {
        kind: "dropdown",
        ariaLabel: "Dropdown value",
        value: "",
        choices: ["Alpha", "Beta"],
        onValueChange: () => {},
      },
    });
    expect(
      host.querySelector<HTMLInputElement>("[role='combobox']")?.placeholder,
    ).toBe("Choose");
    expect(host.querySelector("search")?.className).toContain("!mx-0");

    await mount({
      sectionId: "meta-color",
      sectionName: "Color",
      control: {
        kind: "color",
        controlId: "value",
        ariaLabel: "Color value",
        value: "#ef4444",
        onValueChange: () => {},
      },
    });
    const colorInput = host.querySelector<HTMLInputElement>(
      "input[type='color']",
    );
    expect(colorInput?.id).toBe(
      `${testWorkspace.domId}-meta-color-value-ColorValueInput`,
    );
    expect(colorInput?.getAttribute("aria-label")).toBe("Color value");
  });

  it("dispatches Date and Time inside the full-area field container with the meta Time default", async () => {
    await mount({
      sectionId: "meta-date",
      sectionName: "Date",
      control: {
        kind: "date",
        ariaLabel: "Date value",
        value: "2026-08-12",
        onValueChange: () => {},
      },
    });
    const dateInput = host.querySelector<HTMLInputElement>(
      "input[aria-label='Date value']",
    );
    expect(dateInput?.value).toBe("2026-08-12");
    expect(dateInput?.classList.contains("bg-transparent")).toBe(true);
    expect(dateInput?.closest(".single-cell-container")?.className).toContain(
      "px-3 py-2",
    );

    await mount({
      sectionId: "meta-time",
      sectionName: "Time",
      control: {
        kind: "time",
        ariaLabel: "Time value",
        value: "13:45",
        onValueChange: () => {},
      },
    });
    expect(
      host.querySelector("[aria-label='Time value: 13:45']")?.textContent,
    ).toBe("13:45");
    expect(host.querySelector("input[type='time']")).toBeNull();
  });

  it("dispatches TextArea, Password, and Dropzone at their special full-area surfaces", async () => {
    await mount({
      sectionId: "meta-textarea",
      sectionName: "TextArea",
      control: {
        kind: "textarea",
        controlId: "value",
        ariaLabel: "Text area value",
        value: "first line\nsecond line",
        onValueChange: () => {},
      },
    });
    const textAreaDummy = host.querySelector<HTMLElement>(
      `#${testWorkspace.domId}-meta-textarea-value-MetaControl`,
    );
    expect(textAreaDummy?.className).toContain("min-h-24");
    expect(textAreaDummy?.textContent).toContain("second line");

    await mount({
      sectionId: "meta-password",
      sectionName: "Password",
      control: {
        kind: "password",
        controlId: "value",
        ariaLabel: "Password value",
        value: "secret",
        onValueChange: () => {},
      },
    });
    const password = host.querySelector<HTMLInputElement>(
      "input[type='password']",
    );
    expect(password?.id).toBe(
      `${testWorkspace.domId}-meta-password-value-PasswordValueInput`,
    );
    expect(password?.closest(".single-cell-container")?.className).toContain(
      "h-full",
    );

    await mount({
      sectionId: "meta-dropzone",
      sectionName: "Dropzone",
      control: {
        kind: "dropzone",
        controlId: "value",
        ariaLabel: "Dropzone value",
        attachments: [],
        policy: {
          maxAttachments: null,
          maxFileBytes: 1024,
          maxTotalBytes: null,
          allowedMimePrefixes: [],
        },
        onAccepted: () => {},
        onRejected: () => {},
      },
    });
    expect(
      host.querySelector(
        "[role='group'][aria-label='Dropzone value: Drop a file here']",
      ),
    ).not.toBeNull();
    expect(host.textContent).toContain("Drop a file here");
  });

  it("fails specifically instead of rendering an unknown control fallback", () => {
    expect(() =>
      MetaControl({
        sectionId: "meta-unknown",
        sectionName: "Unknown",
        control: { kind: "mystery" } as never,
      }),
    ).toThrowError("Unknown meta control kind: mystery.");
    expect(() =>
      MetaControl({
        sectionId: "meta-missing",
        sectionName: "Missing",
        control: null as never,
      }),
    ).toThrowError("Unknown meta control kind: undefined.");
  });
});
