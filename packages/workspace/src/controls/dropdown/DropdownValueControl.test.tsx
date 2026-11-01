/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../../test/workspaceTestHost.js";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useItemSelectionMode } from "../../document/itemSelectionMode.js";
import {
  DropdownValueControl,
  type DropdownValueControlProps,
} from "./DropdownValueControl.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CHOICES = ["Alpha", "Beta", "Gamma"];

describe("DropdownValueControl", () => {
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
    testWorkspace.itemSelectionMode.getState().reset();
  });

  async function mount(props: Partial<DropdownValueControlProps> = {}) {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {createElement(DropdownValueControl, {
            ariaLabel: "Choice value",
            value: "Beta",
            onValueChange: () => {},
            choices: CHOICES,
            ...props,
          })}
        </WorkspaceTestProvider>,
      );
    });
  }

  function getInput(): HTMLInputElement {
    const input = host.querySelector<HTMLInputElement>(
      'input[role="combobox"]',
    );
    if (!input) {
      throw new Error("The dropdown input is not rendered.");
    }
    return input;
  }

  function getToggleButton(): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>("search button");
    if (!button) {
      throw new Error("The dropdown toggle button is not rendered.");
    }
    return button;
  }

  function getList(): HTMLElement {
    const list = document.body.querySelector<HTMLElement>('[role="listbox"]');
    if (!list?.parentElement) {
      throw new Error("The dropdown list is not portaled to the body.");
    }

    return list;
  }

  function getVisibleOptions(): Array<string> {
    return Array.from(getList().querySelectorAll("dd")).map(
      (option) => option.textContent ?? "",
    );
  }

  async function openViaToggle() {
    await act(async () => {
      getToggleButton().click();
    });
  }

  async function typeInInput(text: string) {
    const input = getInput();
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!valueSetter) {
      throw new Error("The input value setter is unavailable.");
    }
    await act(async () => {
      valueSetter.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  async function pressKey(key: string) {
    await act(async () => {
      getInput().dispatchEvent(
        new KeyboardEvent("keydown", {
          key,
          code: key,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  }

  it("renders the reference pill presentation inside the value-column wrapper", async () => {
    await mount();
    const wrapper = host.firstElementChild;
    expect(wrapper?.className).toBe(
      "flex h-[20px] relative w-full min-w-0 flex-col items-stretch overflow-visible section-value flex justify-self-start self-center [&_search]:my-auto",
    );
    const search = host.querySelector("search");
    expect(search?.className).toBe(
      "flex min-w-0 mx-[2px] items-center relative nodrag dark:text-setta-200",
    );
    expect(search?.getAttribute("aria-label")).toBe("Choice value choices");
    const input = getInput();

    for (const expectedClass of [
      "setta-workspace-native-reset",
      "rounded-full",
      "text-xs",
      "font-mono",
      "font-medium",
      "ps-3",
      "pe-6",
      "h-4",
      "my-auto",
      "bg-white",
      "dark:bg-setta-900",
      "focus-visible:ring-2",
      "border-setta-100",
      "dark:border-setta-700/70",
    ]) {
      expect(input.classList.contains(expectedClass)).toBe(true);
    }

    expect(input.hasAttribute("id")).toBe(false);
    expect(input.placeholder).toBe("Search");
    expect(input.getAttribute("aria-label")).toBe("Choice value");
    expect(input.hasAttribute("aria-labelledby")).toBe(false);
    const toggle = getToggleButton();
    for (const expectedClass of [
      "nodrag",
      "rounded-full",
      "h-4",
      "w-4",
      "end-1",
    ]) {
      expect(toggle.classList.contains(expectedClass)).toBe(true);
    }
    expect(toggle.type).toBe("button");
    expect(toggle.getAttribute("aria-label")).toBe("Open Choice value choices");
    expect(toggle.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(toggle.parentElement?.className).toBe(
      "absolute inset-y-0 end-0 grid select-none place-items-center",
    );
  });

  it("shows the committed selection in the pill and the full grouped list on open", async () => {
    await mount({ value: "Beta" });
    const input = getInput();
    expect(input.value).toBe("Beta");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    await openViaToggle();
    expect(getInput().getAttribute("aria-expanded")).toBe("true");
    const list = getList();
    expect(list.classList.contains("setta-workspace")).toBe(true);
    expect(list.getAttribute("aria-label")).toBe("Choice value choices");
    expect(list.hasAttribute("aria-labelledby")).toBe(false);
    expect(getToggleButton().getAttribute("aria-label")).toBe(
      "Close Choice value choices",
    );

    for (const expectedClass of [
      "nowheel",
      "nodrag",
      "absolute",
      "z-[80]",
      "mt-8",
      "max-h-96",
      "rounded-md",
      "bg-white",
      "dark:bg-setta-800",
    ]) {
      expect(list.classList.contains(expectedClass)).toBe(true);
    }
    const scrollport = list.querySelector<HTMLElement>(
      ".setta-workspace-dropdown-scrollport",
    );
    expect(scrollport?.classList.contains("overflow-y-scroll")).toBe(true);

    const headers = Array.from(list.querySelectorAll("dt"));
    expect(headers.map((header) => header.textContent)).toEqual(["Choices"]);
    expect(headers[0]?.className).toContain("uppercase");
    expect(getVisibleOptions()).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("keeps a locally rtl trigger and its body-portaled list in the same direction", async () => {
    host.dir = "rtl";
    await mount({ value: "Beta" });

    await openViaToggle();

    const list = getList();
    expect(list.dir).toBe("rtl");
    expect(list.style.left).toBe("");
    expect(list.style.right).not.toBe("");
  });

  it("renders one recorded group header per host-supplied group", async () => {
    await mount({
      value: "",
      choices: [
        { group: "Greek", choices: ["Alpha", "Beta"] },
        { group: "Latin", choices: ["One"] },
      ],
    });
    await openViaToggle();
    const headers = Array.from(getList().querySelectorAll("dt")).map(
      (header) => header.textContent,
    );
    expect(headers).toEqual(["Greek", "Latin"]);
    expect(getVisibleOptions()).toEqual(["Alpha", "Beta", "One"]);
  });

  it("filters the open list through match-sorter while typing", async () => {
    await mount({ value: "" });
    await openViaToggle();
    await typeInInput("ga");
    expect(getVisibleOptions()).toEqual(["Gamma"]);

    await typeInInput("");
    expect(getVisibleOptions()).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("commits a clicked option once through the string seam and closes the list", async () => {
    const onValueChange = vi.fn();
    await mount({ value: "Beta", onValueChange });
    await openViaToggle();
    const gamma = Array.from(getList().querySelectorAll("dd")).find(
      (option) => option.textContent === "Gamma",
    );
    if (!gamma) {
      throw new Error("The Gamma option is not rendered.");
    }
    await act(async () => {
      gamma.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("Gamma");
    expect(getInput().getAttribute("aria-expanded")).toBe("false");
  });

  it("commits the first filtered match on Enter when no row is highlighted", async () => {
    const onValueChange = vi.fn();
    await mount({ value: "", onValueChange });
    await openViaToggle();
    await typeInInput("be");
    await pressKey("Enter");
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("Beta");
  });

  it("resets the draft to the committed selection on Escape and keeps the event bubbling", async () => {
    const onValueChange = vi.fn();
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    await mount({ value: "Beta", onValueChange });
    await openViaToggle();
    await typeInInput("ga");
    await pressKey("Escape");

    expect(getInput().value).toBe("Beta");
    expect(onValueChange).not.toHaveBeenCalled();
    expect(getInput().getAttribute("aria-expanded")).toBe("false");
    expect(documentEscape).toHaveBeenCalled();
    document.removeEventListener("keydown", documentEscape);
  });

  it("shows the full list again when reopening after a filtering selection", async () => {
    await mount({ value: "" });
    await openViaToggle();
    await typeInInput("ga");
    expect(getVisibleOptions()).toEqual(["Gamma"]);
    await openViaToggle();
    await openViaToggle();
    expect(getVisibleOptions()).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("reports a host value with no matching choice once as the cleared selection", async () => {
    const onValueChange = vi.fn();
    await mount({ value: "Delta", onValueChange });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("");
  });

  it("disables the input and toggle from the host flag", async () => {
    await mount({ disabled: true });
    expect(getInput().disabled).toBe(true);
    expect(getToggleButton().disabled).toBe(true);
  });

  it("disables package-wide during item-select mode", async () => {
    testWorkspace.itemSelectionMode.setState({ isSelectingItems: true });
    await mount();
    expect(getInput().disabled).toBe(true);
    expect(getToggleButton().disabled).toBe(true);
  });
});
