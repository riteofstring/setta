/* @vitest-environment jsdom */
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
  useWorkspaceGraph,
  WorkspaceGraphProvider,
} from "./WorkspaceGraphContext";
import { WorkspaceGraphPorts } from "./WorkspaceGraphPorts";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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
  onConnect: WorkspaceGraphConfiguration["onConnect"],
  canConnect: WorkspaceGraphConfiguration["canConnect"] = () => true,
): WorkspaceGraphConfiguration {
  return {
    canConnect,
    edges: [],
    onConnect,
    ports: [
      {
        family: "agentic",
        id: "source-output",
        label: "Source output",
        sectionId: "source",
        type: "source",
      },
      {
        family: "agentic",
        id: "target-input",
        label: "Target input",
        sectionId: "target",
        type: "target",
      },
    ],
    selectedEdgeIds: new Set(),
  };
}

function GraphPortsHarness({
  configuration,
}: {
  configuration?: WorkspaceGraphConfiguration;
}) {
  return (
    <WorkspaceGraphProvider configuration={configuration}>
      <div data-section-id="source">
        <WorkspaceGraphPorts sectionId="source" />
      </div>
      <div data-section-id="target">
        <WorkspaceGraphPorts sectionId="target" />
      </div>
      <ReconnectTrigger />
    </WorkspaceGraphProvider>
  );
}

function ReconnectTrigger() {
  const graph = useWorkspaceGraph();
  return (
    <button
      data-testid="workspace-graph-reconnect-trigger"
      onPointerDown={(event) =>
        graph?.beginReconnect(
          "agent-edge",
          "source",
          { x: 120, y: 80 },
          event.pointerId,
        )
      }
      type="button"
    />
  );
}

function getPort(host: HTMLElement, portId: string): HTMLButtonElement {
  const port = host.querySelector<HTMLButtonElement>(
    `[data-workspace-graph-port-id="${portId}"]`,
  );
  if (!port) {
    throw new Error(`Workspace graph port ${portId} did not render.`);
  }
  return port;
}

function setPortRect(port: HTMLButtonElement, left: number, top: number): void {
  const anchor = port.querySelector<HTMLElement>(
    "[data-workspace-graph-port-anchor]",
  );
  if (!anchor) {
    throw new Error("Workspace graph port anchor did not render.");
  }
  Object.defineProperty(anchor, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        bottom: top + 14,
        height: 14,
        left,
        right: left + 14,
        top,
        width: 14,
      }) as DOMRect,
  });
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
        clientX: 120,
        clientY: 80,
      }),
    );
  });
}

describe("WorkspaceGraphPorts", () => {
  let host: HTMLDivElement;
  let root: Root;
  let workspace: WorkspaceTestHost;

  beforeEach(() => {
    workspace = createWorkspaceTestHost();
    workspace.document.setState({
      sections: {
        source: createSection("source"),
        target: createSection("target"),
      },
    });
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

  it("renders Workspace-native default target and source ports", async () => {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphPortsHarness configuration={createConfiguration(vi.fn())} />
        </WorkspaceTestProvider>,
      );
    });

    const source = getPort(host, "source-output");
    const target = getPort(host, "target-input");
    expect(source.getAttribute("data-port-side")).toBe("right");
    expect(source.getAttribute("data-port-type")).toBe("source");
    expect(target.getAttribute("data-port-side")).toBe("left");
    expect(target.getAttribute("data-port-type")).toBe("target");
    expect(source.getAttribute("aria-label")).toBe("Source output");
    expect(target.getAttribute("aria-label")).toBe("Target input");
    expect(source.hasAttribute("data-section-id")).toBe(false);
    expect(
      source.querySelector('[data-workspace-graph-port-anchor="true"]'),
    ).not.toBeNull();
  });

  it("normalizes target-originated gestures before proposing a connection", async () => {
    const onConnect = vi.fn();
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphPortsHarness configuration={createConfiguration(onConnect)} />
        </WorkspaceTestProvider>,
      );
    });

    const source = getPort(host, "source-output");
    const target = getPort(host, "target-input");
    setPortRect(source, 100, 40);
    setPortRect(target, 300, 40);
    await dispatchPointer(target, "pointerdown");
    expect(source.getAttribute("data-connection-state")).toBe("valid");
    await dispatchPointer(source, "pointerup");

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onConnect).toHaveBeenCalledWith({
      family: "agentic",
      source: { portId: "source-output", sectionId: "source" },
      target: { portId: "target-input", sectionId: "target" },
    });
    const callbackConnection = onConnect.mock.calls[0]?.[0];
    expect(Object.isFrozen(callbackConnection)).toBe(true);
  });

  it("shows invalid feedback and does not publish rejected connections", async () => {
    const onConnect = vi.fn();
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphPortsHarness
            configuration={createConfiguration(onConnect, () => false)}
          />
        </WorkspaceTestProvider>,
      );
    });

    const source = getPort(host, "source-output");
    const target = getPort(host, "target-input");
    setPortRect(source, 100, 40);
    setPortRect(target, 300, 40);
    await dispatchPointer(source, "pointerdown");
    expect(target.getAttribute("data-connection-state")).toBe("invalid");
    await dispatchPointer(target, "pointerup");
    expect(onConnect).not.toHaveBeenCalled();
  });

  it("keeps connection gestures disabled when structure editing is unavailable", async () => {
    const onConnect = vi.fn();
    workspace.capabilities.setState({ canEditStructure: false });
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphPortsHarness configuration={createConfiguration(onConnect)} />
        </WorkspaceTestProvider>,
      );
    });

    const source = getPort(host, "source-output");
    const target = getPort(host, "target-input");
    expect(source.disabled).toBe(true);
    await dispatchPointer(source, "pointerdown");
    await dispatchPointer(target, "pointerup");
    expect(onConnect).not.toHaveBeenCalled();
  });

  it("enables candidate ports during reconnect-only gestures", async () => {
    const onReconnect = vi.fn();
    const baseConfiguration = createConfiguration(undefined);
    const configuration: WorkspaceGraphConfiguration = {
      ...baseConfiguration,
      edges: [
        {
          family: "agentic",
          id: "agent-edge",
          source: { portId: "source-output", sectionId: "source" },
          target: { portId: "target-input", sectionId: "target" },
        },
      ],
      onReconnect,
    };
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphPortsHarness configuration={configuration} />
        </WorkspaceTestProvider>,
      );
    });

    const source = getPort(host, "source-output");
    const trigger = host.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-graph-reconnect-trigger"]',
    );
    if (!trigger) {
      throw new Error("Workspace graph reconnect trigger did not render.");
    }
    expect(source.disabled).toBe(true);
    await dispatchPointer(trigger, "pointerdown");
    expect(source.disabled).toBe(false);
    await dispatchPointer(source, "pointerup");
    expect(onReconnect).toHaveBeenCalledWith({
      connection: {
        family: "agentic",
        source: { portId: "source-output", sectionId: "source" },
        target: { portId: "target-input", sectionId: "target" },
      },
      edgeId: "agent-edge",
    });
  });

  it("marks configured disabled ports with the graph style contract", async () => {
    const baseConfiguration = createConfiguration(vi.fn());
    const configuration = {
      ...baseConfiguration,
      ports: baseConfiguration.ports.map((port) =>
        port.id === "source-output" ? { ...port, disabled: true } : port,
      ),
    };
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <GraphPortsHarness configuration={configuration} />
        </WorkspaceTestProvider>,
      );
    });

    const source = getPort(host, "source-output");
    expect(source.disabled).toBe(true);
    expect(
      source.classList.contains("setta-workspace-graph-port--disabled"),
    ).toBe(true);
  });
});
