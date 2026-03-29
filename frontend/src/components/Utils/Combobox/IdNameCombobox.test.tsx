/* @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { IdNameCombobox } from "./IdNameCombobox";

function ComboboxHarness({
  autoOpenOnMount = false,
  clearInputAfterSelection = false,
  initialSelectedId = null,
  isDisabled = false,
  selectedItemCanBeNull = false,
}: {
  autoOpenOnMount?: boolean;
  clearInputAfterSelection?: boolean;
  initialSelectedId?: string | null;
  isDisabled?: boolean;
  selectedItemCanBeNull?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  );

  return (
    <div>
      <IdNameCombobox
        allItems={[
          {
            group: "Choices",
            items: [
              { id: "alpha", name: "Alpha" },
              { id: "beta", name: "Beta" },
            ],
          },
        ]}
        clearInputAfterSelection={clearInputAfterSelection}
        inputDivId="combobox-test-input"
        isDisabled={isDisabled}
        onSelectedItemChange={setSelectedId}
        placeholder="Pick one"
        selectedItemCanBeNull={selectedItemCanBeNull}
        shouldAutoOpenOnMount={autoOpenOnMount}
        value={selectedId}
      />
      <output data-testid="selected-id">{selectedId ?? "null"}</output>
    </div>
  );
}

let host: HTMLDivElement;
let root: Root;

function getInput() {
  const input = host.querySelector("input");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Missing combobox input.");
  }
  return input;
}

function getToggleButton() {
  const button = host.querySelector("button");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Missing combobox toggle button.");
  }
  return button;
}

function getMenu() {
  const menu = document.body.querySelector("div.nowheel.nodrag");
  if (!(menu instanceof HTMLDivElement)) {
    throw new Error("Missing combobox menu.");
  }
  return menu;
}

function getItemByText(label: string) {
  return Array.from(document.body.querySelectorAll("dd")).find(
    (item) => item.textContent === label,
  );
}

describe("IdNameCombobox", () => {
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
    document.body.innerHTML = "";
  });

  it("opens the portaled menu, preserves the input id, and applies the selected label", async () => {
    await act(async () => {
      root.render(<ComboboxHarness />);
    });

    const input = getInput();
    expect(input.id).toBe("combobox-test-input");

    expect(getMenu().className).toContain("hidden");

    await act(async () => {
      getToggleButton().dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(getMenu().className).toContain("flex");

    const betaItem = getItemByText("Beta");
    if (!(betaItem instanceof HTMLElement)) {
      throw new Error("Missing combobox item Beta.");
    }

    await act(async () => {
      betaItem.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(input.value).toBe("Beta");
    expect(host.querySelector('[data-testid="selected-id"]')?.textContent).toBe(
      "beta",
    );
  });

  it("keeps the menu closed when the combobox is disabled", async () => {
    await act(async () => {
      root.render(<ComboboxHarness isDisabled={true} />);
    });

    const menuBeforeClick = getMenu();
    expect(menuBeforeClick.className).toContain("hidden");

    await act(async () => {
      getToggleButton().dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(getMenu().className).toContain("hidden");
    expect(host.querySelector('[data-testid="selected-id"]')?.textContent).toBe(
      "null",
    );
  });

  it("can auto-open and focus the combobox input on mount", async () => {
    await act(async () => {
      root.render(<ComboboxHarness autoOpenOnMount={true} />);
    });

    const input = getInput();
    expect(document.activeElement).toBe(input);
    expect(getMenu().className).toContain("flex");
  });
});
