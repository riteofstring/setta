/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StandaloneWorkspaceWindowSpaceSurface } from "./StandaloneWorkspaceWindowSpaceSurface";
import {
  createWorkspaceWindowSpace,
  type WorkspaceWindowSpace,
} from "./windowSpaces";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createSpace({
  id = "space",
  windows = [
    {
      contentId: "left-content",
      id: "left",
      normalizedBounds: { height: 1, width: 0.5, x: 0, y: 0 },
      rendererData: {},
      sectionId: null,
      surfaceKind: "example",
      title: "Left",
      zIndex: 3,
    },
    {
      contentId: "right-content",
      id: "right",
      normalizedBounds: { height: 1, width: 0.5, x: 0.5, y: 0 },
      rendererData: {},
      sectionId: null,
      surfaceKind: "example",
      title: "Right",
      zIndex: 3,
    },
  ],
}: {
  id?: string;
  windows?: WorkspaceWindowSpace["windows"];
} = {}): WorkspaceWindowSpace {
  return createWorkspaceWindowSpace({
    id,
    name: "Research",
    order: 0,
    windows,
  });
}

describe("StandaloneWorkspaceWindowSpaceSurface", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function mount(
    windowSpace: WorkspaceWindowSpace,
    revision?: string | number,
  ): Promise<void> {
    await act(async () => {
      root.render(
        <StandaloneWorkspaceWindowSpaceSurface
          renderers={{
            example: (window) => (
              <span data-testid={`renderer-${window.id}`}>{window.title}</span>
            ),
          }}
          revision={revision}
          windowSpace={windowSpace}
        />,
      );
    });
  }

  function getWindow(id: string): HTMLElement {
    const window = host.querySelector<HTMLElement>(
      `[data-workspace-window-id="${id}"]`,
    );
    if (!window) {
      throw new Error(`Expected standalone window ${id}.`);
    }
    return window;
  }

  it("renders flat frames and exposes a semantic shared separator above every local window", async () => {
    await mount(
      createSpace({
        windows: createSpace().windows.map((window) => ({
          ...window,
          zIndex: 31,
        })),
      }),
    );

    const frame = host.querySelector<HTMLElement>(
      ".setta-workspace-standalone-window-space-frame",
    );
    const seams = host.querySelector<HTMLElement>(
      ".setta-workspace-standalone-window-space-seams",
    );
    const separator = host.querySelector<HTMLElement>("[role=separator]");
    expect(frame?.classList.contains("setta-workspace-window-surface")).toBe(
      true,
    );
    expect(seams?.getAttribute("aria-hidden")).toBeNull();
    expect(separator?.getAttribute("aria-orientation")).toBe("vertical");
    expect(seams?.style.zIndex).toBe("32");
  });

  it("keeps pointer focus local and makes a tied window uniquely top", async () => {
    await mount(createSpace());

    await act(async () => {
      getWindow("left").dispatchEvent(
        new Event("pointerdown", { bubbles: true }),
      );
    });

    expect(getWindow("left").style.zIndex).toBe("4");
    expect(getWindow("right").style.zIndex).toBe("3");
  });

  it("preserves local focus for the same key and resets it when the revision changes", async () => {
    const space = createSpace();
    await mount(space, 1);
    await act(async () => {
      getWindow("left").dispatchEvent(
        new Event("pointerdown", { bubbles: true }),
      );
    });
    await mount(
      createSpace({
        windows: createSpace().windows.map((window) =>
          window.id === "left" ? { ...window, title: "Updated left" } : window,
        ),
      }),
      1,
    );
    expect(getWindow("left").style.zIndex).toBe("4");
    expect(host.textContent).toContain("Updated left");

    await mount(space, 2);
    expect(getWindow("left").style.zIndex).toBe("3");
  });

  it("uses explicit accessible states for empty spaces and missing renderers", async () => {
    await mount(createSpace({ windows: [] }));
    expect(host.querySelector("[role=status]")?.textContent).toContain(
      "This window space does not have any saved floating windows.",
    );

    await act(async () => {
      root.render(
        <StandaloneWorkspaceWindowSpaceSurface
          renderers={{}}
          windowSpace={createSpace({
            windows: [
              {
                contentId: "unknown-content",
                id: "unknown",
                normalizedBounds: { height: 1, width: 1, x: 0, y: 0 },
                rendererData: {},
                sectionId: null,
                surfaceKind: "unknown",
                title: "Unknown",
                zIndex: 0,
              },
            ],
          })}
        />,
      );
    });
    expect(
      host.querySelector(
        '[data-testid="standalone-workspace-window-space-missing-renderer"]',
      )?.textContent,
    ).toContain("No renderer is registered for unknown.");
  });
});
