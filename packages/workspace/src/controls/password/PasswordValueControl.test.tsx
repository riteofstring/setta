/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../../test/workspaceTestHost";

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
import { useItemSelectionMode } from "../../document/itemSelectionMode";
import { useSectionRefs } from "../../section/sectionRefs";
import {
  PasswordValueControl,
  type PasswordValueControlProps,
} from "./PasswordValueControl";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SECTION_ID = "panel";
const ITEM_ID = "password";
const INPUT_ID = `${SECTION_ID}-${ITEM_ID}-PasswordValueInput`;

describe("PasswordValueControl", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    testWorkspace.itemSelectionMode.getState().reset();
    testWorkspace.sectionRefs.getState().reset();
  });

  function mount(props: Partial<PasswordValueControlProps> = {}) {
    act(() => {
      root.render(
        <WorkspaceTestProvider workspace={testWorkspace}>
          {createElement(PasswordValueControl, {
          ariaLabel: "Password value",
          sectionId: SECTION_ID,
          itemId: ITEM_ID,
          value: "secret",
          onValueChange: () => {},
          ...props,
        })
        }</WorkspaceTestProvider>,
      );
    });
  }

  function getInput(): HTMLInputElement {
    const input = host.querySelector<HTMLInputElement>(
      `#${testWorkspace.domId}-${INPUT_ID}`,
    );
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("The password input is not rendered.");
    }
    return input;
  }

  function getVisibilityToggle(): HTMLButtonElement {
    const toggle = host.querySelector<HTMLButtonElement>(
      'button[aria-label$="password"]',
    );
    if (!toggle) {
      throw new Error("The password visibility toggle is not rendered.");
    }
    return toggle;
  }

  it("renders the frozen ordinary-row presentation with accessible native controls", () => {
    mount();
    const input = getInput();
    expect(input.type).toBe("password");
    expect(input.value).toBe("secret");
    expect(input.getAttribute("aria-label")).toBe("Password value");
    for (const expectedClass of [
      "section-value",
      "flex-1",
      "nodrag",
      "nopan",
      "peer/textinput",
      "w-full",
      "font-mono",
      "text-xs",
      "bg-transparent",
      "pe-8",
    ]) {
      const target = ["section-value", "flex-1"].includes(expectedClass)
        ? input.parentElement
        : input;
      expect(target?.classList.contains(expectedClass)).toBe(true);
    }
    const toggle = getVisibilityToggle();
    expect(toggle.getAttribute("aria-label")).toBe("Show password");
    // The frozen control removes this native button from tab order. The package keeps the
    // non-visual native tab stop so keyboard users can reach the same show/hide action.
    expect(toggle.tabIndex).toBe(0);
    expect(toggle.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(host.querySelector("span.section-value")?.className).toContain(
      "peer-focus-within/textinput:border-blue-400",
    );
  });

  it("toggles between obscured and visible presentation without changing the value", () => {
    const onValueChange = vi.fn();
    mount({ onValueChange });
    act(() => getVisibilityToggle().click());
    expect(getInput().type).toBe("text");
    expect(getInput().value).toBe("secret");
    expect(getVisibilityToggle().getAttribute("aria-label")).toBe(
      "Hide password",
    );
    expect(onValueChange).not.toHaveBeenCalled();
    act(() => getVisibilityToggle().click());
    expect(getInput().type).toBe("password");
  });

  it("reports native input edits once through the controlled string seam", () => {
    const onValueChange = vi.fn();
    mount({ onValueChange });
    const input = getInput();
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!valueSetter) {
      throw new Error("The native input value setter is unavailable.");
    }
    act(() => {
      valueSetter.call(input, "next secret");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("next secret");
  });

  it("returns focus to the owning section on Escape", () => {
    const sectionRoot = document.createElement("div");
    sectionRoot.tabIndex = -1;
    document.body.appendChild(sectionRoot);
    testWorkspace.sectionRefs.setState({ withNested: { [SECTION_ID]: sectionRoot } });
    const documentEscape = vi.fn();
    document.addEventListener("keydown", documentEscape);
    mount({ savedValueAction: { pending: false, onReveal: () => {} } });
    const reveal = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Reveal saved password"]',
    );
    for (const control of [getInput(), getVisibilityToggle(), reveal]) {
      control?.focus();
      act(() => {
        control?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            code: "Escape",
            bubbles: true,
          }),
        );
      });
      expect(document.activeElement).toBe(sectionRoot);
    }
    expect(documentEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", documentEscape);
    sectionRoot.remove();
  });

  it("accepts host-owned placeholder and saved-value reveal state", () => {
    const onReveal = vi.fn();
    mount({
      value: "",
      placeholder: "Saved",
      savedValueAction: { pending: false, onReveal },
    });
    expect(getInput().placeholder).toBe("Saved");
    const reveal = host.querySelector<HTMLButtonElement>(
      'button[title="Reveal saved password"]',
    );
    if (!reveal) {
      throw new Error("The saved-value reveal action is not rendered.");
    }
    expect(reveal.textContent).toBe("Reveal");
    expect(reveal.disabled).toBe(false);
    act(() => reveal.click());
    expect(onReveal).toHaveBeenCalledTimes(1);

    mount({
      value: "",
      placeholder: "Saved",
      savedValueAction: { pending: true, onReveal },
    });
    const pendingReveal = host.querySelector<HTMLButtonElement>(
      'button[title="Reveal saved password"]',
    );
    expect(pendingReveal?.textContent).toBe("Revealing...");
    expect(pendingReveal?.disabled).toBe(true);
    expect(pendingReveal?.getAttribute("aria-busy")).toBe("true");
  });

  it("disables editing and saved-value requests through host and item-select state", () => {
    const onReveal = vi.fn();
    mount({ disabled: true, savedValueAction: { pending: false, onReveal } });
    expect(getInput().disabled).toBe(true);
    expect(getInput().classList.contains("cursor-text")).toBe(false);
    expect(getVisibilityToggle().disabled).toBe(true);
    expect(getVisibilityToggle().classList.contains("cursor-not-allowed")).toBe(
      true,
    );
    act(() => getVisibilityToggle().click());
    expect(getInput().type).toBe("password");
    expect(
      host.querySelector<HTMLButtonElement>(
        'button[title="Reveal saved password"]',
      )?.disabled,
    ).toBe(true);

    testWorkspace.itemSelectionMode.setState({ isSelectingItems: true });
    mount({ savedValueAction: { pending: false, onReveal } });
    expect(getInput().disabled).toBe(true);
    expect(getVisibilityToggle().disabled).toBe(true);
    expect(host.querySelector("span.section-value")?.className).not.toContain(
      "peer-focus-within/textinput:border-blue-400",
    );
  });
});
