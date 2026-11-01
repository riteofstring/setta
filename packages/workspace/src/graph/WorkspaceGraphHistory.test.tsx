/* @vitest-environment jsdom */
import { act, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useCanvasKeyActivations } from "../canvas/keyActivations";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import type { WorkspaceSectionInput } from "../document/types";
import { recordWorkspaceHistoryEntry } from "../history/workspaceHistory";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import { useWorkspaceHost, WorkspaceProvider } from "../workspaceHostContext";
import { registerWorkspaceHostElement } from "../workspaceHostInternals";
import type { WorkspaceGraphConfiguration, WorkspaceGraphEdge } from "./types";
import { WorkspaceGraphProvider } from "./WorkspaceGraphContext";
import { WorkspaceGraphPorts } from "./WorkspaceGraphPorts";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function leaf(id: string): WorkspaceSectionInput {
  return {
    children: [],
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: "leaf",
    name: id,
    overflowMode: false,
    positionAndSizeLocked: false,
    styleColor: null,
    tagColor: null,
  };
}

function PatchBay() {
  const host = useWorkspaceHost();
  useCanvasKeyActivations();
  const [edges, setEdges] = useState<ReadonlyArray<WorkspaceGraphEdge>>([]);
  const configuration = useMemo<WorkspaceGraphConfiguration>(
    () => ({
      canConnect: () => true,
      edges,
      families: { audio: { color: "#22d3ee" } },
      onConnect: (connection) => {
        const edge = { ...connection, id: "drift-filter" };
        const add = () => setEdges((current) => [...current, edge]);
        add();
        recordWorkspaceHistoryEntry(host, {
          redo: add,
          undo: () =>
            setEdges((current) =>
              current.filter((value) => value.id !== edge.id),
            ),
        });
      },
      ports: [
        {
          family: "audio",
          id: "drift-out",
          label: "Drift out",
          sectionId: "drift",
          type: "source",
        },
        {
          family: "audio",
          id: "filter-in",
          label: "Filter in",
          sectionId: "filter",
          type: "target",
        },
      ],
      selectedEdgeIds: new Set(),
    }),
    [edges, host],
  );
  return (
    <WorkspaceGraphProvider configuration={configuration}>
      <WorkspaceGraphPorts sectionId="drift" />
      <WorkspaceGraphPorts sectionId="filter" />
      <output data-testid="cables">{edges.map((edge) => edge.id)}</output>
    </WorkspaceGraphProvider>
  );
}

describe("host-owned graph history", () => {
  let container: HTMLDivElement;
  let host: WorkspaceHost;
  let root: Root;
  let unregister: () => void;

  beforeEach(async () => {
    host = createWorkspaceHost({ history: { kind: "local" } });
    registerSectionKinds(host, { leaf: { renderContent: () => null } });
    host.loadDocument({
      activeIds: [],
      savedViews: null,
      sections: { drift: leaf("drift"), filter: leaf("filter") },
      topLevelSections: {
        drift: { h: 80, w: 160, x: 0, y: 0, zIndex: 0 },
        filter: { h: 80, w: 160, x: 240, y: 0, zIndex: 1 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    container = document.createElement("div");
    container.tabIndex = -1;
    document.body.appendChild(container);
    unregister = registerWorkspaceHostElement(host, container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        <WorkspaceProvider host={host}>
          <PatchBay />
        </WorkspaceProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    unregister();
    container.remove();
    host.dispose();
  });

  async function dispatch(target: EventTarget, event: Event): Promise<Event> {
    await act(async () => {
      target.dispatchEvent(event);
    });
    return event;
  }

  async function pressChord(shiftKey: boolean): Promise<Event> {
    const event = await dispatch(
      container,
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code: "KeyZ",
        ctrlKey: true,
        key: "z",
        shiftKey,
      }),
    );
    await dispatch(
      container,
      new KeyboardEvent("keyup", { bubbles: true, code: "KeyZ", key: "z" }),
    );
    return event;
  }

  function getCables(): string {
    return container.querySelector('[data-testid="cables"]')?.textContent ?? "";
  }

  it("undoes and redoes a recorded connection with the history chords", async () => {
    const pointer = { bubbles: true, button: 0, cancelable: true };
    await dispatch(
      container.querySelector('[data-workspace-graph-port-id="drift-out"]')!,
      new MouseEvent("pointerdown", pointer),
    );
    await dispatch(
      container.querySelector('[data-workspace-graph-port-id="filter-in"]')!,
      new MouseEvent("pointerup", pointer),
    );
    expect(getCables()).toBe("drift-filter");

    expect((await pressChord(false)).defaultPrevented).toBe(true);
    expect(getCables()).toBe("");
    expect((await pressChord(true)).defaultPrevented).toBe(true);
    expect(getCables()).toBe("drift-filter");
  });
});
