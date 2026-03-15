/* @vitest-environment jsdom */

import "testUtils/reactRefreshPreamble";

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("components/Utils/CodeMirror/InlineCodeMirrorInput", () => ({
  InlineCodeMirrorInput({
    id,
    value,
    placeholder,
    onChange,
  }: {
    id: string;
    value: string;
    placeholder?: string;
    onChange: (value: string) => void;
  }) {
    return (
      <input
        id={id}
        data-testid="file-browser-filter-input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    );
  },
}));

vi.mock("components/Utils/atoms/popover/standardpopover", () => ({
  StandardPopover({
    open,
    onOpenChange,
    trigger,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    trigger: React.ReactNode;
    children: React.ReactNode;
  }) {
    return (
      <div>
        <button
          type="button"
          data-testid="mock-search-scope-trigger"
          onClick={() => onOpenChange(!open)}
        >
          Toggle
        </button>
        <div data-testid="mock-trigger-slot">{trigger}</div>
        {open ? <div role="dialog">{children}</div> : null}
      </div>
    );
  },
}));

vi.mock("forks/xyflow/core/store", () => ({
  useReactFlow: {
    subscribe: () => () => {},
  },
}));

import { useHomeFileBrowserState } from "state/stores/fileBrowserStores";
import { FileBrowserFilter } from "./fileBrowserPaneSearchFilter";

describe("FileBrowserFilter", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    useHomeFileBrowserState.getState().reset?.();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    useHomeFileBrowserState.getState().reset?.();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("debounces filter text into the store and triggers saved-search actions", async () => {
    const onSaveSearch = vi.fn();

    await act(async () => {
      root.render(
        <FileBrowserFilter
          useFileBrowserStateHook={useHomeFileBrowserState}
          saveSearchConfig={{ canSave: true, onSaveSearch }}
        />,
      );
    });

    const input = host.querySelector(
      '[data-testid="file-browser-filter-input"]',
    );
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Missing file browser filter input.");
    }

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!valueSetter) {
        throw new Error("Missing HTMLInputElement value setter.");
      }
      valueSetter.call(input, "docs");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      vi.advanceTimersByTime(200);
    });

    expect(useHomeFileBrowserState.getState().filterText).toBe("docs");

    const saveButton = host.querySelector('button[aria-label="Save search"]');
    if (!(saveButton instanceof HTMLButtonElement)) {
      throw new Error("Missing save-search button.");
    }

    await act(async () => {
      saveButton.click();
    });

    expect(onSaveSearch).toHaveBeenCalledWith("docs");
  });

  it("switches between recursive and local search scopes", async () => {
    await act(async () => {
      root.render(
        <FileBrowserFilter useFileBrowserStateHook={useHomeFileBrowserState} />,
      );
    });

    const trigger = host.querySelector(
      '[data-testid="mock-search-scope-trigger"]',
    );
    if (!(trigger instanceof HTMLButtonElement)) {
      throw new Error("Missing mock search-scope trigger.");
    }

    await act(async () => {
      trigger.click();
    });

    const localButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Local search"),
    );
    if (!(localButton instanceof HTMLButtonElement)) {
      throw new Error("Missing local search option.");
    }

    await act(async () => {
      localButton.click();
    });
    expect(useHomeFileBrowserState.getState().searchScope).toBe("local");

    await act(async () => {
      trigger.click();
    });

    const recursiveButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Recursive search"),
    );
    if (!(recursiveButton instanceof HTMLButtonElement)) {
      throw new Error("Missing recursive search option.");
    }

    await act(async () => {
      recursiveButton.click();
    });
    expect(useHomeFileBrowserState.getState().searchScope).toBe("recursive");
  });
});
