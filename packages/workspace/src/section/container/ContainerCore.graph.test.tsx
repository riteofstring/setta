/* @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../../test/workspaceTestHost";
import type { WorkspaceSection } from "../../document/types";
import { WorkspaceGraphProvider } from "../../graph/WorkspaceGraphContext";
import { Container } from "./ContainerCore";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function createGroupSection(): WorkspaceSection {
  return {
    children: [],
    id: "group",
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: "group",
    name: "Group",
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: "auto", width: "auto" },
    styleColor: null,
    tagColor: null,
  };
}

describe("Container group graph ports", () => {
  let host: HTMLDivElement;
  let root: Root;
  let workspace: WorkspaceTestHost;

  beforeEach(() => {
    workspace = createWorkspaceTestHost();
    workspace.document.setState({
      sections: { group: createGroupSection() },
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

  it("renders a positioned controlled port on the group shell", async () => {
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <WorkspaceGraphProvider
            configuration={{
              canConnect: () => true,
              edges: [],
              onConnect: vi.fn(),
              ports: [
                {
                  family: "workflow",
                  id: "group-output",
                  label: "Group output",
                  position: 0.25,
                  sectionId: "group",
                  type: "source",
                },
              ],
              selectedEdgeIds: new Set(),
            }}
          >
            <Container isGroup sectionId="group">
              Group content
            </Container>
          </WorkspaceGraphProvider>
        </WorkspaceTestProvider>,
      );
    });

    const groupShell = host.querySelector<HTMLElement>(
      '[data-section-id="group"]',
    );
    const port = host.querySelector<HTMLButtonElement>(
      '[data-workspace-graph-port-id="group-output"]',
    );
    expect(groupShell).not.toBeNull();
    expect(groupShell?.getAttribute("data-workspace-section-shell")).toBe(
      "true",
    );
    expect(groupShell?.contains(port)).toBe(true);
    expect(port?.getAttribute("data-port-side")).toBe("right");
    expect(port?.style.top).toBe("25%");
  });
});
