/* @vitest-environment jsdom */

import { WorkspaceControls } from "@setta/workspace";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  registerPlaygroundMenuExtensions,
  usePlaygroundHostCommandState,
} from "./menuExtensions";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The package paints a contributed control from host-owned command state and repaints it with the
// host's tree, so the host has to re-render the tree the workspace is mounted in when that state
// changes. This is the playground doing exactly that.
function PlaygroundToolbarHost() {
  usePlaygroundHostCommandState();
  return createElement(WorkspaceControls);
}

describe("playground toolbar contributions", () => {
  let host: HTMLDivElement;
  let root: Root;

  function getControl(label: string): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    if (!button) {
      throw new Error(`Missing contributed toolbar control: ${label}`);
    }
    return button;
  }

  async function click(button: HTMLButtonElement): Promise<void> {
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  beforeEach(async () => {
    registerPlaygroundMenuExtensions();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(createElement(PlaygroundToolbarHost));
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  // One sequence, because the host's status and toggle live in the module the playground registers
  // its commands from: the run starts from the state a freshly loaded playground has.
  it("repaints a contributed control when the host command state behind it changes", async () => {
    expect(
      getControl("Clear host action status").getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      getControl("Highlight host controls").getAttribute("aria-pressed"),
    ).toBe("false");

    await click(getControl("Highlight host controls"));

    expect(
      getControl("Highlight host controls").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      getControl("Clear host action status").getAttribute("aria-disabled"),
    ).toBe(null);

    await click(getControl("Clear host action status"));

    expect(
      getControl("Clear host action status").getAttribute("aria-disabled"),
    ).toBe("true");

    await click(getControl("Highlight host controls"));

    expect(
      getControl("Highlight host controls").getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
