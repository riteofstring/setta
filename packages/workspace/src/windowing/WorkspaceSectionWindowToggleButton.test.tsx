/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";
import {
  WorkspaceSectionWindowToggleButton,
  type WorkspaceSectionWindowToggleButtonProps,
} from "./WorkspaceSectionWindowToggleButton";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SECTION_ID = "section-1";

describe("WorkspaceSectionWindowToggleButton", () => {
  let host: HTMLDivElement;
  let root: Root;
  let workspace: WorkspaceTestHost;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    workspace = createWorkspaceTestHost();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    workspace.host.dispose();
  });

  async function mount(
    props: Partial<WorkspaceSectionWindowToggleButtonProps> = {},
  ): Promise<void> {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <WorkspaceSectionWindowToggleButton
            hasOpenExternalWindow={false}
            layoutEditable={true}
            onOpenInFloatingWindow={() => {}}
            onShowInCanvas={() => {}}
            sectionId={SECTION_ID}
            sectionWindowingSupported={true}
            {...props}
          />
        </WorkspaceTestProvider>,
      );
    });
  }

  function getButton(): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(
      '[data-testid="section-window-toggle"]',
    );
    if (!button) {
      throw new Error("Expected the section-window toggle.");
    }
    return button;
  }

  it("opens an eligible canvas section in a floating window", async () => {
    const onOpenInFloatingWindow = vi.fn();
    const onShowInCanvas = vi.fn();
    await mount({ onOpenInFloatingWindow, onShowInCanvas });

    const button = getButton();
    expect(button.getAttribute("aria-label")).toBe(
      "Open section in floating window",
    );
    expect(button.title).toBe("Open section in floating window");
    expect(button.dataset.sectionId).toBe(SECTION_ID);
    expect(button.dataset.workspaceSectionWindowToggleMode).toBe(
      "open-in-window",
    );
    expect(button.querySelector("svg")).not.toBeNull();

    await act(async () => button.click());
    expect(onOpenInFloatingWindow).toHaveBeenCalledOnce();
    expect(onOpenInFloatingWindow).toHaveBeenCalledWith(SECTION_ID);
    expect(onShowInCanvas).not.toHaveBeenCalled();
  });

  it("returns an open external section to the canvas", async () => {
    const onOpenInFloatingWindow = vi.fn();
    const onShowInCanvas = vi.fn();
    await mount({
      hasOpenExternalWindow: true,
      onOpenInFloatingWindow,
      onShowInCanvas,
    });

    const button = getButton();
    expect(button.getAttribute("aria-label")).toBe("Show section in canvas");
    expect(button.title).toBe("Show section in canvas");
    expect(button.dataset.workspaceSectionWindowToggleMode).toBe(
      "show-in-canvas",
    );
    expect(button.querySelector("svg")).not.toBeNull();

    await act(async () => button.click());
    expect(onShowInCanvas).toHaveBeenCalledOnce();
    expect(onShowInCanvas).toHaveBeenCalledWith(SECTION_ID);
    expect(onOpenInFloatingWindow).not.toHaveBeenCalled();
  });

  it("honors the caller-provided main eligibility and layout policy", async () => {
    await mount({ layoutEditable: false });
    expect(
      host.querySelector('[data-testid="section-window-toggle"]'),
    ).toBeNull();

    await mount({ layoutEditable: true, sectionWindowingSupported: false });
    expect(
      host.querySelector('[data-testid="section-window-toggle"]'),
    ).toBeNull();
  });
});
