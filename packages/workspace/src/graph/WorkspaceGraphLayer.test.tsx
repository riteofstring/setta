/* @vitest-environment jsdom */
import { useCallback, useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost";
import type { WorkspaceSection } from "../document/types";
import type { WorkspaceGraphConfiguration } from "./types";
import {
  WorkspaceGraphProvider,
  useWorkspaceGraph,
} from "./WorkspaceGraphContext";
import { WorkspaceGraphLayer } from "./WorkspaceGraphLayer";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type PortRect = Readonly<{
  left: number;
  top: number;
}>;

const initialPortRects: Readonly<Record<string, PortRect>> = {
  "agent-source": { left: 200, top: 190 },
  "agent-target": { left: 500, top: 270 },
  "data-source": { left: 200, top: 130 },
  "data-target": { left: 500, top: 130 },
  "replacement-source": { left: 350, top: 360 },
  "workflow-source": { left: 200, top: 250 },
  "workflow-target": { left: 500, top: 360 },
};

const portRects: Record<string, PortRect> = { ...initialPortRects };

function createSection(id: string): WorkspaceSection {
  return {
    children: [],
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: "leaf",
    name: id,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 100, width: 180 },
    styleColor: null,
    tagColor: null,
  };
}

function createConfiguration(
  overrides: Partial<WorkspaceGraphConfiguration> = {},
): WorkspaceGraphConfiguration {
  return {
    canConnect: () => true,
    edges: [
      {
        family: "data",
        id: "data-edge",
        label: "Data",
        source: { portId: "data-source", sectionId: "source" },
        target: { portId: "data-target", sectionId: "target" },
      },
      {
        family: "agentic",
        id: "agent-edge",
        source: { portId: "agent-source", sectionId: "source" },
        status: "running",
        target: { portId: "agent-target", sectionId: "target" },
      },
      {
        family: "workflow",
        id: "workflow-edge",
        source: { portId: "workflow-source", sectionId: "source" },
        target: { portId: "workflow-target", sectionId: "nested" },
      },
    ],
    ports: [
      {
        family: "data",
        id: "data-source",
        label: "Data source",
        sectionId: "source",
        type: "source",
      },
      {
        family: "data",
        id: "data-target",
        label: "Data target",
        sectionId: "target",
        type: "target",
      },
      {
        family: "agentic",
        id: "agent-source",
        label: "Agent source",
        sectionId: "source",
        type: "source",
      },
      {
        family: "agentic",
        id: "agent-target",
        label: "Agent target",
        sectionId: "target",
        type: "target",
      },
      {
        family: "workflow",
        id: "workflow-source",
        label: "Workflow source",
        sectionId: "source",
        type: "source",
      },
      {
        family: "workflow",
        id: "workflow-target",
        label: "Workflow target",
        sectionId: "nested",
        type: "target",
      },
      {
        family: "data",
        id: "replacement-source",
        label: "Replacement source",
        sectionId: "nested",
        type: "source",
      },
    ],
    selectedEdgeIds: new Set(),
    ...overrides,
  };
}

function GraphPortElement({ portId }: { portId: string }) {
  const ref = useCallback(
    (element: HTMLSpanElement | null) => {
      if (!element) {
        return;
      }
      Object.defineProperty(element, "getBoundingClientRect", {
        configurable: true,
        value: () => {
          const rect = portRects[portId];
          if (!rect) {
            return new DOMRect();
          }
          return {
            bottom: rect.top + 10,
            height: 10,
            left: rect.left,
            right: rect.left + 10,
            top: rect.top,
            width: 10,
          } as DOMRect;
        },
      });
    },
    [portId],
  );
  return (
    <button data-workspace-graph-port-id={portId} type="button">
      <span data-workspace-graph-port-anchor="true" ref={ref} />
    </button>
  );
}

function GraphGestureTrigger() {
  const graph = useWorkspaceGraph();
  return (
    <button
      data-testid="workspace-graph-connect-trigger"
      onPointerDown={(event) => {
        graph?.beginConnection(
          "data-source",
          { x: 205, y: 135 },
          event.pointerId,
        );
      }}
      type="button"
    />
  );
}

function GraphLayerHarness({
  configuration,
  hiddenPortIds = new Set<string>(),
}: {
  configuration: WorkspaceGraphConfiguration;
  hiddenPortIds?: ReadonlySet<string>;
}) {
  const [rootElement, setRootElement] = useState<HTMLDivElement | null>(null);
  const rootRef = useCallback((element: HTMLDivElement | null) => {
    if (element) {
      Object.defineProperty(element, "getBoundingClientRect", {
        configurable: true,
        value: () =>
          ({
            bottom: 450,
            height: 400,
            left: 100,
            right: 700,
            top: 50,
            width: 600,
          }) as DOMRect,
      });
    }
    setRootElement(element);
  }, []);
  return (
    <WorkspaceGraphProvider configuration={configuration}>
      <div ref={rootRef} tabIndex={-1}>
        <GraphGestureTrigger />
        {configuration.ports
          .filter(
            (port) =>
              port.sectionId !== "nested" && !hiddenPortIds.has(port.id),
          )
          .map((port) => (
            <GraphPortElement key={port.id} portId={port.id} />
          ))}
        <div data-testid="workspace-graph-nested-layout">
          {configuration.ports
            .filter(
              (port) =>
                port.sectionId === "nested" && !hiddenPortIds.has(port.id),
            )
            .map((port) => (
              <GraphPortElement key={port.id} portId={port.id} />
            ))}
        </div>
        <WorkspaceGraphLayer rootElement={rootElement} />
      </div>
    </WorkspaceGraphProvider>
  );
}

function getEdge(host: HTMLElement, edgeId: string): SVGGElement {
  const edge = host.querySelector<SVGGElement>(`[data-edge-id="${edgeId}"]`);
  if (!edge) {
    throw new Error(`Workspace graph edge ${edgeId} did not render.`);
  }
  return edge;
}

async function dispatchPointer(
  target: EventTarget,
  type: "pointerdown" | "pointerup",
): Promise<void> {
  await act(async () => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 200,
        clientY: 140,
      }),
    );
  });
}

describe("WorkspaceGraphLayer", () => {
  let host: HTMLDivElement;
  let root: Root;
  let workspace: WorkspaceTestHost;

  beforeEach(() => {
    Object.assign(portRects, initialPortRects);
    workspace = createWorkspaceTestHost();
    workspace.document.setState({
      sections: {
        nested: createSection("nested"),
        source: createSection("source"),
        target: createSection("target"),
      },
    });
    workspace.reactFlow.setState({ transform: [20, 30, 2] });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    workspace.host.dispose();
  });

  it("renders all supported families with measured nested endpoint geometry", async () => {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness configuration={createConfiguration()} />
        </WorkspaceTestProvider>,
      );
    });

    const dataEdge = getEdge(host, "data-edge");
    const agentEdge = getEdge(host, "agent-edge");
    const workflowEdge = getEdge(host, "workflow-edge");
    expect(dataEdge.className.baseVal).toContain("--data");
    expect(agentEdge.className.baseVal).toContain("--agentic");
    expect(agentEdge.className.baseVal).toContain("--running");
    expect(workflowEdge.className.baseVal).toContain("--workflow");
    expect(
      dataEdge
        .querySelector(".setta-workspace-graph-edge-path")
        ?.getAttribute("d"),
    ).toContain("M42.5,27.5");
    expect(
      workflowEdge
        .querySelector(".setta-workspace-graph-edge-path")
        ?.getAttribute("d"),
    ).toContain("192.5,142.5");
    expect(
      dataEdge
        .querySelector(".setta-workspace-graph-edge-interaction")
        ?.getAttribute("stroke-width"),
    ).toBe("20");
  });

  it("keeps edge geometry fixed in workspace coordinates while the viewport pans", async () => {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness configuration={createConfiguration()} />
        </WorkspaceTestProvider>,
      );
    });

    const before = getEdge(host, "agent-edge")
      .querySelector(".setta-workspace-graph-edge-path")
      ?.getAttribute("d");
    for (const [portId, rect] of Object.entries(portRects)) {
      portRects[portId] = { left: rect.left + 60, top: rect.top + 40 };
    }
    await act(async () => {
      workspace.reactFlow.setState({ transform: [80, 70, 2] });
      await Promise.resolve();
    });

    const after = getEdge(host, "agent-edge")
      .querySelector(".setta-workspace-graph-edge-path")
      ?.getAttribute("d");
    expect(after).toBe(before);
  });

  it("removes edges whose endpoint is hidden from the rendered section tree", async () => {
    const configuration = createConfiguration();
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness
            configuration={configuration}
            hiddenPortIds={new Set(["workflow-target"])}
          />
        </WorkspaceTestProvider>,
      );
    });

    expect(host.querySelector('[data-edge-id="workflow-edge"]')).toBeNull();
    expect(host.querySelector('[data-edge-id="data-edge"]')).not.toBeNull();
  });

  it("refreshes nested edge geometry after a nested layout style move", async () => {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness configuration={createConfiguration()} />
        </WorkspaceTestProvider>,
      );
    });

    const before = getEdge(host, "workflow-edge")
      .querySelector(".setta-workspace-graph-edge-path")
      ?.getAttribute("d");
    const nestedLayout = host.querySelector<HTMLElement>(
      '[data-testid="workspace-graph-nested-layout"]',
    );
    if (!nestedLayout) {
      throw new Error("Workspace graph nested layout did not render.");
    }
    portRects["workflow-target"] = { left: 560, top: 360 };
    await act(async () => {
      nestedLayout.style.transform = "translateX(60px)";
      await Promise.resolve();
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    const after = getEdge(host, "workflow-edge")
      .querySelector(".setta-workspace-graph-edge-path")
      ?.getAttribute("d");
    expect(before).toContain("192.5,142.5");
    expect(after).toContain("222.5,142.5");
    expect(after).not.toBe(before);
  });

  it("shows and clears the live bezier preview with the connection gesture", async () => {
    const onConnect = vi.fn();
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness
            configuration={createConfiguration({ onConnect })}
          />
        </WorkspaceTestProvider>,
      );
    });

    const trigger = host.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-graph-connect-trigger"]',
    );
    const target = host.querySelector<HTMLButtonElement>(
      '[data-workspace-graph-port-id="data-target"]',
    );
    if (!trigger || !target) {
      throw new Error("Workspace graph connection controls did not render.");
    }
    await dispatchPointer(trigger, "pointerdown");
    const preview = host.querySelector<SVGPathElement>(
      '[data-testid="workspace-graph-connection-preview"]',
    );
    expect(preview).not.toBeNull();
    expect(preview?.getAttribute("class")).toContain(
      "setta-workspace-graph-connection-preview",
    );
    expect(preview?.getAttribute("d")).toContain("M42.5,27.5");

    await dispatchPointer(target, "pointerup");
    expect(onConnect).toHaveBeenCalledWith({
      family: "data",
      source: { portId: "data-source", sectionId: "source" },
      target: { portId: "data-target", sectionId: "target" },
    });
    expect(
      host.querySelector('[data-testid="workspace-graph-connection-preview"]'),
    ).toBeNull();
  });

  it("proposes selection and deletion through controlled callbacks", async () => {
    const onSelectedEdgeIdsChange = vi.fn();
    const onDelete = vi.fn();
    workspace.activeSections.setState({ activeIds: ["source"] });
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness
            configuration={createConfiguration({
              onDelete,
              onSelectedEdgeIdsChange,
              selectedEdgeIds: new Set(["data-edge"]),
            })}
          />
        </WorkspaceTestProvider>,
      );
    });

    await act(async () => {
      getEdge(host, "agent-edge").dispatchEvent(
        new MouseEvent("click", { bubbles: true, ctrlKey: true }),
      );
    });
    expect(onSelectedEdgeIdsChange).toHaveBeenCalledWith(
      new Set(["data-edge", "agent-edge"]),
    );
    expect(workspace.activeSections.getState().activeIds).toEqual([]);

    await act(async () => {
      getEdge(host, "data-edge").dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Delete",
        }),
      );
    });
    expect(onDelete).toHaveBeenCalledWith(["data-edge"]);
  });

  it("allows read-only hosts to select while retaining destructive capability gates", async () => {
    const onSelectedEdgeIdsChange = vi.fn();
    const onDelete = vi.fn();
    workspace.capabilities.setState({ canEditStructure: false });
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness
            configuration={createConfiguration({
              onDelete,
              onSelectedEdgeIdsChange,
              selectedEdgeIds: new Set(["data-edge"]),
            })}
          />
        </WorkspaceTestProvider>,
      );
    });

    await act(async () => {
      getEdge(host, "agent-edge").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      getEdge(host, "data-edge").dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Delete",
        }),
      );
    });
    expect(onSelectedEdgeIdsChange).toHaveBeenCalledWith(
      new Set(["agent-edge"]),
    );
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("clears selection on Escape without stealing unrelated canvas shortcuts", async () => {
    const onSelectedEdgeIdsChange = vi.fn();
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness
            configuration={createConfiguration({
              onSelectedEdgeIdsChange,
              selectedEdgeIds: new Set(["data-edge"]),
            })}
          />
        </WorkspaceTestProvider>,
      );
    });

    const canvasRoot = host.querySelector<HTMLDivElement>("[tabindex='-1']");
    if (!canvasRoot) {
      throw new Error("Workspace graph canvas root did not render.");
    }
    const escape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    await act(async () => {
      canvasRoot.dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(true);
    expect(onSelectedEdgeIdsChange).toHaveBeenCalledWith(new Set());

    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness
            configuration={createConfiguration({ selectedEdgeIds: new Set() })}
          />
        </WorkspaceTestProvider>,
      );
    });
    const unclaimedEscape = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Escape",
    });
    await act(async () => {
      canvasRoot.dispatchEvent(unclaimedEscape);
    });
    expect(unclaimedEscape.defaultPrevented).toBe(false);
    const unclaimedDelete = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Delete",
    });
    await act(async () => {
      canvasRoot.dispatchEvent(unclaimedDelete);
    });
    expect(unclaimedDelete.defaultPrevented).toBe(false);
  });

  it("proposes reconnects through a detached Workspace-native connection", async () => {
    const onReconnect = vi.fn();
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness
            configuration={createConfiguration({ onReconnect })}
          />
        </WorkspaceTestProvider>,
      );
    });

    const sourceAnchor = getEdge(
      host,
      "data-edge",
    ).querySelector<SVGCircleElement>(
      '[data-workspace-graph-reconnect="source"]',
    );
    const replacement = host.querySelector<HTMLButtonElement>(
      '[data-workspace-graph-port-id="replacement-source"]',
    );
    if (!sourceAnchor || !replacement) {
      throw new Error("Workspace graph reconnect controls did not render.");
    }
    await dispatchPointer(sourceAnchor, "pointerdown");
    await dispatchPointer(replacement, "pointerup");

    expect(onReconnect).toHaveBeenCalledWith({
      connection: {
        family: "data",
        source: { portId: "replacement-source", sectionId: "nested" },
        target: { portId: "data-target", sectionId: "target" },
      },
      edgeId: "data-edge",
    });
    const reconnect = onReconnect.mock.calls[0]?.[0];
    expect(Object.isFrozen(reconnect.connection)).toBe(true);
  });
});
