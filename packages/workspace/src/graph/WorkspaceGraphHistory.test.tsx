/* @vitest-environment jsdom */
import { act, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCanvasKeyActivations } from "../canvas/keyActivations.js";
import { registerSectionKinds } from "../document/sectionKindRegistry.js";
import type { WorkspaceSectionInput } from "../document/types.js";
import { recordWorkspaceHistoryEntry } from "../history/workspaceHistory.js";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost.js";
import {
  useWorkspaceHost,
  WorkspaceProvider,
} from "../workspaceHostContext.js";
import { registerWorkspaceHostElement } from "../workspaceHostInternals.js";
import type {
  WorkspaceGraphConfiguration,
  WorkspaceGraphEdge,
} from "./types.js";
import { WorkspaceGraphProvider } from "./WorkspaceGraphContext.js";
import { WorkspaceGraphLayer } from "./WorkspaceGraphLayer.js";
import { WorkspaceGraphPorts } from "./WorkspaceGraphPorts.js";

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

const DRIFT_FILTER: WorkspaceGraphEdge = {
  family: "audio",
  id: "drift-filter",
  source: { portId: "drift-out", sectionId: "drift" },
  target: { portId: "filter-in", sectionId: "filter" },
};

function PatchBay({
  initialEdges,
  rootElement,
}: {
  initialEdges: ReadonlyArray<WorkspaceGraphEdge>;
  rootElement: HTMLElement;
}) {
  const host = useWorkspaceHost();
  useCanvasKeyActivations();
  const [edges, setEdges] = useState(initialEdges);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const configuration = useMemo<WorkspaceGraphConfiguration>(
    () => ({
      canConnect: () => true,
      edges,
      families: { audio: { color: "#22d3ee" } },
      onDelete: (edgeIds) => {
        const removed = edges.filter((edge) => edgeIds.includes(edge.id));
        const remove = () =>
          setEdges((current) =>
            current.filter((edge) => !edgeIds.includes(edge.id)),
          );
        remove();
        recordWorkspaceHistoryEntry(host, {
          redo: remove,
          undo: () => setEdges((current) => [...current, ...removed]),
        });
      },
      onSelectedEdgeIdsChange: setSelectedEdgeIds,
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
      selectedEdgeIds,
    }),
    [edges, host, selectedEdgeIds],
  );
  return (
    <WorkspaceGraphProvider configuration={configuration}>
      <WorkspaceGraphPorts sectionId="drift" />
      <WorkspaceGraphPorts sectionId="filter" />
      <output data-testid="cables">{edges.map((edge) => edge.id)}</output>
      <WorkspaceGraphLayer rootElement={rootElement} />
    </WorkspaceGraphProvider>
  );
}

describe("host-owned graph history", () => {
  let container: HTMLDivElement;
  let host: WorkspaceHost;
  let root: Root;
  let unregister: () => void;

  beforeEach(() => {
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
  });

  async function renderPatchBay(
    initialEdges: ReadonlyArray<WorkspaceGraphEdge>,
  ): Promise<void> {
    await act(async () => {
      root.render(
        <WorkspaceProvider host={host}>
          <PatchBay initialEdges={initialEdges} rootElement={container} />
        </WorkspaceProvider>,
      );
    });
  }

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    unregister();
    container.remove();
    host.dispose();
    vi.restoreAllMocks();
  });

  async function dispatch(target: EventTarget, event: Event): Promise<Event> {
    await act(async () => {
      target.dispatchEvent(event);
    });
    return event;
  }

  async function pressChord(shiftKey: boolean): Promise<Event> {
    const event = await dispatch(
      document.activeElement ?? document.body,
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
    await renderPatchBay([]);
    container.focus();
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

  it("keeps focus in the workspace after deleting the focused edge so Mod+Z restores it", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 100, 100),
    );
    await renderPatchBay([DRIFT_FILTER]);
    const edge = container.querySelector<SVGGElement>(
      '[data-edge-id="drift-filter"]',
    );
    if (!edge) {
      throw new Error("Workspace graph edge did not render.");
    }
    await dispatch(edge, new MouseEvent("click", { bubbles: true }));
    edge.focus();
    await dispatch(
      edge,
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Backspace",
      }),
    );
    expect(getCables()).toBe("");
    expect(container.contains(document.activeElement)).toBe(true);

    expect((await pressChord(false)).defaultPrevented).toBe(true);
    expect(getCables()).toBe("drift-filter");
  });
});
