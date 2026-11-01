/* @vitest-environment jsdom */
import { useCallback, useMemo, useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../test/workspaceTestHost.js";
import type { WorkspaceSection } from "../document/types.js";
import type {
  WorkspaceGraphConfiguration,
  WorkspaceGraphEdge,
} from "./types.js";
import {
  WorkspaceGraphProvider,
  useWorkspaceGraph,
} from "./WorkspaceGraphContext.js";
import { WorkspaceGraphLayer } from "./WorkspaceGraphLayer.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type PortRect = Readonly<{
  left: number;
  top: number;
}>;

const initialPortRects: Readonly<Record<string, PortRect>> = {
  "mod-source": { left: 200, top: 190 },
  "mod-target": { left: 500, top: 270 },
  "data-source": { left: 200, top: 130 },
  "data-target": { left: 500, top: 130 },
  "replacement-source": { left: 350, top: 360 },
  "notes-source": { left: 200, top: 250 },
  "notes-target": { left: 500, top: 360 },
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
        family: "audio",
        id: "data-edge",
        label: "Data",
        source: { portId: "data-source", sectionId: "source" },
        target: { portId: "data-target", sectionId: "target" },
      },
      {
        family: "mod",
        id: "mod-edge",
        source: { portId: "mod-source", sectionId: "source" },
        status: "running",
        target: { portId: "mod-target", sectionId: "target" },
      },
      {
        family: "notes",
        id: "notes-edge",
        label: "Ready",
        source: { portId: "notes-source", sectionId: "source" },
        target: { portId: "notes-target", sectionId: "nested" },
      },
    ],
    families: {
      audio: { color: "#22d3ee" },
      mod: { color: "#a78bfa", pattern: "dotted" },
      notes: { color: "#f59e0b", pattern: "dashed" },
    },
    ports: [
      {
        family: "audio",
        id: "data-source",
        label: "Data source",
        sectionId: "source",
        type: "source",
      },
      {
        family: "audio",
        id: "data-target",
        label: "Data target",
        sectionId: "target",
        type: "target",
      },
      {
        family: "mod",
        id: "mod-source",
        label: "Mod source",
        sectionId: "source",
        type: "source",
      },
      {
        family: "mod",
        id: "mod-target",
        label: "Mod target",
        sectionId: "target",
        type: "target",
      },
      {
        family: "notes",
        id: "notes-source",
        label: "Notes source",
        sectionId: "source",
        type: "source",
      },
      {
        family: "notes",
        id: "notes-target",
        label: "Notes target",
        sectionId: "nested",
        type: "target",
      },
      {
        family: "audio",
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
  nestedClassName,
}: {
  configuration: WorkspaceGraphConfiguration;
  hiddenPortIds?: ReadonlySet<string>;
  nestedClassName?: string;
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
        <div
          className={nestedClassName}
          data-testid="workspace-graph-nested-layout"
        >
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

function ControlledEdgeDeletionHost({
  onSelectedEdgeIdsChange,
}: {
  onSelectedEdgeIdsChange: (edgeIds: ReadonlySet<string>) => void;
}) {
  const [edges, setEdges] = useState<ReadonlyArray<WorkspaceGraphEdge>>(
    () => createConfiguration().edges,
  );
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const configuration = useMemo(
    () =>
      createConfiguration({
        edges,
        onDelete: (edgeIds) =>
          setEdges((current) =>
            current.filter((edge) => !edgeIds.includes(edge.id)),
          ),
        onSelectedEdgeIdsChange: (edgeIds) => {
          onSelectedEdgeIdsChange(edgeIds);
          setSelectedEdgeIds(edgeIds);
        },
        selectedEdgeIds,
      }),
    [edges, onSelectedEdgeIdsChange, selectedEdgeIds],
  );
  return <GraphLayerHarness configuration={configuration} />;
}

function getEdge(host: HTMLElement, edgeId: string): SVGGElement {
  const edge = host.querySelector<SVGGElement>(`[data-edge-id="${edgeId}"]`);
  if (!edge) {
    throw new Error(`Workspace graph edge ${edgeId} did not render.`);
  }
  return edge;
}

function getEdgeElementAttribute(
  edge: ParentNode,
  selector: string,
  attribute: string,
): string | null {
  const element = edge.querySelector(selector);
  if (!element) {
    throw new Error(`Workspace graph element ${selector} did not render.`);
  }
  return element.getAttribute(attribute);
}

function isPaintedByClip(
  edge: ParentNode,
  selector: string,
  x: number,
  y: number,
): boolean {
  const reference = getEdgeElementAttribute(edge, selector, "clip-path");
  const clipId = reference?.match(/^url\(#(.+)\)$/u)?.[1] ?? "";
  const d =
    document.getElementById(clipId)?.querySelector("path")?.getAttribute("d") ??
    "";
  const rectangles = [
    ...d.matchAll(/M(-?[\d.]+),(-?[\d.]+)H(-?[\d.]+)V(-?[\d.]+)H-?[\d.]+Z/gu),
  ].map((match) => match.slice(1).map(Number));
  const containing = rectangles.filter(
    ([left = 0, top = 0, right = 0, bottom = 0]) =>
      x >= left && x <= right && y >= top && y <= bottom,
  );
  return containing.length % 2 === 1;
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

  it("renders host-declared families with measured nested endpoint geometry", async () => {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness configuration={createConfiguration()} />
        </WorkspaceTestProvider>,
      );
    });

    const dataEdge = getEdge(host, "data-edge");
    const modEdge = getEdge(host, "mod-edge");
    const notesEdge = getEdge(host, "notes-edge");
    expect(dataEdge.getAttribute("data-edge-family")).toBe("audio");
    expect(
      dataEdge.style.getPropertyValue("--setta-workspace-graph-family-color"),
    ).toBe("#22d3ee");
    expect(
      modEdge.style.getPropertyValue("--setta-workspace-graph-family-color"),
    ).toBe("#a78bfa");
    expect(dataEdge.classList).not.toContain(
      "setta-workspace-graph-edge--dashed",
    );
    expect(modEdge.classList).toContain("setta-workspace-graph-edge--dotted");
    expect(modEdge.classList).toContain("setta-workspace-graph-edge--running");
    expect(notesEdge.classList).toContain("setta-workspace-graph-edge--dashed");
    expect(modEdge.getAttribute("aria-label")).toBe("mod edge");
    expect(notesEdge.getAttribute("aria-label")).toBe("notes edge: Ready");
    expect(
      notesEdge.querySelector(".setta-workspace-graph-edge-label-text")
        ?.textContent,
    ).toBe("Ready");
    expect(
      getEdgeElementAttribute(
        dataEdge,
        ".setta-workspace-graph-edge-path",
        "d",
      ),
    ).toContain("M42.5,27.5");
    expect(
      getEdgeElementAttribute(
        notesEdge,
        ".setta-workspace-graph-edge-path",
        "d",
      ),
    ).toContain("192.5,142.5");
  });

  it("keeps edge geometry fixed in workspace coordinates while the viewport pans", async () => {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness configuration={createConfiguration()} />
        </WorkspaceTestProvider>,
      );
    });

    const before = getEdge(host, "mod-edge")
      .querySelector(".setta-workspace-graph-edge-path")
      ?.getAttribute("d");
    for (const [portId, rect] of Object.entries(portRects)) {
      portRects[portId] = { left: rect.left + 60, top: rect.top + 40 };
    }
    await act(async () => {
      workspace.reactFlow.setState({ transform: [80, 70, 2] });
      await Promise.resolve();
    });

    const after = getEdge(host, "mod-edge")
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
            hiddenPortIds={new Set(["notes-target"])}
          />
        </WorkspaceTestProvider>,
      );
    });

    expect(host.querySelector('[data-edge-id="notes-edge"]')).toBeNull();
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

    const before = getEdge(host, "notes-edge")
      .querySelector(".setta-workspace-graph-edge-path")
      ?.getAttribute("d");
    const nestedLayout = host.querySelector<HTMLElement>(
      '[data-testid="workspace-graph-nested-layout"]',
    );
    if (!nestedLayout) {
      throw new Error("Workspace graph nested layout did not render.");
    }
    portRects["notes-target"] = { left: 560, top: 360 };
    await act(async () => {
      nestedLayout.style.transform = "translateX(60px)";
      await Promise.resolve();
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    });

    const after = getEdge(host, "notes-edge")
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
      family: "audio",
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
      getEdge(host, "mod-edge").dispatchEvent(
        new MouseEvent("click", { bubbles: true, ctrlKey: true }),
      );
    });
    expect(onSelectedEdgeIdsChange).toHaveBeenCalledWith(
      new Set(["data-edge", "mod-edge"]),
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

  it("keeps a host mounted when the deleted edge leaves its selection behind", async () => {
    const onSelectedEdgeIdsChange = vi.fn();
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <ControlledEdgeDeletionHost
            onSelectedEdgeIdsChange={onSelectedEdgeIdsChange}
          />
        </WorkspaceTestProvider>,
      );
    });

    await act(async () => {
      getEdge(host, "data-edge").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(getEdge(host, "data-edge").classList).toContain(
      "setta-workspace-graph-edge--selected",
    );
    await act(async () => {
      getEdge(host, "data-edge").dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Backspace",
        }),
      );
    });

    expect(host.querySelector('[data-edge-id="data-edge"]')).toBeNull();
    expect(getEdge(host, "mod-edge")).not.toBeNull();
    expect(onSelectedEdgeIdsChange).toHaveBeenLastCalledWith(new Set());
  });

  it("ignores selected ids for edges the host removed", async () => {
    const onSelectedEdgeIdsChange = vi.fn();
    const configuration = createConfiguration();
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness
            configuration={createConfiguration({
              edges: configuration.edges.filter(
                (edge) => edge.id !== "data-edge",
              ),
              onSelectedEdgeIdsChange,
              selectedEdgeIds: new Set(["data-edge"]),
            })}
          />
        </WorkspaceTestProvider>,
      );
    });

    expect(host.querySelector('[data-edge-id="data-edge"]')).toBeNull();
    await act(async () => {
      getEdge(host, "mod-edge").dispatchEvent(
        new MouseEvent("click", { bubbles: true, ctrlKey: true }),
      );
    });
    expect(onSelectedEdgeIdsChange).toHaveBeenCalledWith(new Set(["mod-edge"]));
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
      getEdge(host, "mod-edge").dispatchEvent(
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
    expect(onSelectedEdgeIdsChange).toHaveBeenCalledWith(new Set(["mod-edge"]));
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
    const canConnect = vi.fn(() => false);
    const canReconnect = vi.fn(() => true);
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness
            configuration={createConfiguration({
              canConnect,
              canReconnect,
              onReconnect,
            })}
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
        family: "audio",
        source: { portId: "replacement-source", sectionId: "nested" },
        target: { portId: "data-target", sectionId: "target" },
      },
      edgeId: "data-edge",
    });
    expect(canConnect).not.toHaveBeenCalled();
    expect(canReconnect).toHaveBeenCalledWith({
      connection: {
        family: "audio",
        source: { portId: "replacement-source", sectionId: "nested" },
        target: { portId: "data-target", sectionId: "target" },
      },
      edgeId: "data-edge",
    });
    const reconnect = onReconnect.mock.calls[0]?.[0];
    expect(Object.isFrozen(reconnect.connection)).toBe(true);
  });

  it("keeps cable paint and hit-testing off every measured port", async () => {
    portRects["replacement-source"] = { left: 506, top: 360 };
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness configuration={createConfiguration()} />
        </WorkspaceTestProvider>,
      );
    });

    const dataEdge = getEdge(host, "data-edge");
    const paint = ".setta-workspace-graph-edge-path";
    const hit = ".setta-workspace-graph-edge-interaction";
    expect(isPaintedByClip(dataEdge, paint, 42.5, 27.5)).toBe(false);
    expect(isPaintedByClip(dataEdge, paint, 49, 27.5)).toBe(true);
    expect(isPaintedByClip(dataEdge, hit, 49, 27.5)).toBe(false);
    expect(isPaintedByClip(dataEdge, hit, 52, 27.5)).toBe(true);
    expect(isPaintedByClip(dataEdge, hit, 194, 142.5)).toBe(false);
    expect(isPaintedByClip(dataEdge, paint, 194, 142.5)).toBe(false);
  });

  it("drops edges whose port is scrolled out of a bounded group and restores them on scroll", async () => {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness
            configuration={createConfiguration()}
            nestedClassName="setta-workspace-bounded-group-scroll"
          />
        </WorkspaceTestProvider>,
      );
    });
    const scroller = host.querySelector<HTMLElement>(
      '[data-testid="workspace-graph-nested-layout"]',
    );
    if (!scroller) {
      throw new Error("Workspace graph nested layout did not render.");
    }
    let scrollerTop = 380;
    Object.defineProperty(scroller, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          bottom: scrollerTop + 100,
          height: 100,
          left: 400,
          right: 600,
          top: scrollerTop,
          width: 200,
        }) as DOMRect,
    });
    await act(async () => {
      scroller.dispatchEvent(new Event("scroll"));
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    });
    expect(host.querySelector('[data-edge-id="notes-edge"]')).toBeNull();
    expect(host.querySelector('[data-edge-id="data-edge"]')).not.toBeNull();

    scrollerTop = 300;
    await act(async () => {
      scroller.dispatchEvent(new Event("scroll"));
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
    });
    expect(host.querySelector('[data-edge-id="notes-edge"]')).not.toBeNull();
  });

  it("yields cable hit-testing to a control under the pointer outside a press", async () => {
    const button = document.createElement("button");
    const background = document.createElement("div");
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphLayerHarness configuration={createConfiguration()} />
        </WorkspaceTestProvider>,
      );
    });
    const layer = host.querySelector("svg");
    const stroke = host.querySelector(
      ".setta-workspace-graph-edge-interaction",
    );
    const canvas = layer?.parentElement;
    if (!layer || !stroke || !canvas) {
      throw new Error("Workspace graph layer did not render.");
    }
    canvas.append(button, background);
    let under: Element = button;
    Object.defineProperty(document, "elementsFromPoint", {
      configurable: true,
      value: () => [stroke, under, canvas],
    });
    const move = async (buttons: number) => {
      await act(async () => {
        canvas.dispatchEvent(
          new MouseEvent("pointermove", { bubbles: true, buttons }),
        );
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
      });
    };

    await move(0);
    expect(layer.hasAttribute("data-workspace-graph-yield")).toBe(true);
    under = background;
    await move(1);
    expect(layer.hasAttribute("data-workspace-graph-yield")).toBe(true);
    await move(0);
    expect(layer.hasAttribute("data-workspace-graph-yield")).toBe(false);
    under = button;
    document.body.append(button);
    await move(0);
    expect(layer.hasAttribute("data-workspace-graph-yield")).toBe(false);
    button.remove();
    background.remove();
    Reflect.deleteProperty(document, "elementsFromPoint");
  });
});
