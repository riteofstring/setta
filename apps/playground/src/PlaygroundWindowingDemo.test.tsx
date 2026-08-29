/* @vitest-environment jsdom */

import {
  createWorkspaceHost,
  createWorkspaceShellViewState,
  DEFAULT_SECTION_TAG_COLOR_PALETTE,
  WorkspaceProvider,
  type WorkspaceHost,
  type WorkspaceShellViewState,
} from "@setta/workspace";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { playgroundDocument } from "./playgroundDocument";
import { PlaygroundWindowingDemo } from "./PlaygroundWindowingDemo";
import {
  PLAYGROUND_INITIAL_ITEM_DIAGNOSTICS,
  registerPlaygroundSectionKinds,
} from "./sectionKinds";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createVisibleWindowSpacesViewState(): WorkspaceShellViewState {
  const initial = createWorkspaceShellViewState({
    trailingTabId: "host-window-spaces",
  });
  return {
    ...initial,
    trailing: { ...initial.trailing, visible: true },
  };
}

function WindowingDemoHarness() {
  const [shellViewState, setShellViewState] = useState(
    createVisibleWindowSpacesViewState,
  );
  return (
    <PlaygroundWindowingDemo
      baseTrailingTabs={[]}
      itemDiagnostics={PLAYGROUND_INITIAL_ITEM_DIAGNOSTICS}
      leadingPaneShiftsCanvas={false}
      leadingTabs={[]}
      onShellViewStateChange={setShellViewState}
      sectionTagColorPalette={DEFAULT_SECTION_TAG_COLOR_PALETTE}
      shellViewState={shellViewState}
    />
  );
}

describe("playground floating-window demo", () => {
  let host: HTMLDivElement;
  let root: Root;
  let workspaceHost: WorkspaceHost;

  beforeEach(async () => {
    workspaceHost = createWorkspaceHost();
    registerPlaygroundSectionKinds(workspaceHost);
    workspaceHost.loadDocument(playgroundDocument);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <WorkspaceProvider host={workspaceHost}>
          <WindowingDemoHarness />
        </WorkspaceProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    workspaceHost.dispose();
  });

  async function click(selector: string): Promise<void> {
    const button = host.querySelector<HTMLButtonElement>(selector);
    if (!button) {
      throw new Error(`Expected ${selector} to be rendered.`);
    }
    await act(async () => button.click());
  }

  it("renders arbitrary content, reopens a closed demo window, and restores a host snapshot", async () => {
    expect(
      host.querySelectorAll('[data-testid="workspace-window-manager-window"]'),
    ).toHaveLength(2);
    expect(host.textContent).toContain("Generic renderer");

    await click('[aria-label="Close Reference note"]');
    expect(
      host.querySelectorAll('[data-testid="workspace-window-manager-window"]'),
    ).toHaveLength(1);

    await click(".playground-window-spaces-host-pane .playground-pane-action");
    expect(
      host.querySelectorAll('[data-testid="workspace-window-manager-window"]'),
    ).toHaveLength(2);

    await click('[data-testid="workspace-window-space-save"]');
    expect(
      host.querySelectorAll('[data-testid="workspace-window-space-row"]'),
    ).toHaveLength(1);

    await click('[aria-label="Close Reference note"]');
    await click('[data-testid="workspace-window-space-restore"]');
    expect(
      host.querySelectorAll('[data-testid="workspace-window-manager-window"]'),
    ).toHaveLength(2);
  });
});
