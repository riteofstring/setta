/* @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
  WorkspaceTestProvider,
} from "../../../test/workspaceTestHost";
import { registerWorkspaceCommands } from "../../commands/workspaceCommandRegistry";
import { SectionDndContext } from "../../dnd/SectionDndContext";
import { loadWorkspaceDocument } from "../../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../../document/sectionKindRegistry";
import type { WorkspaceSection } from "../../document/types";
import { SectionContainer } from "./SectionContainer";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("SectionContainer registered attachment", () => {
  let container: HTMLDivElement;
  let root: Root;
  let workspace: WorkspaceTestHost;

  beforeEach(() => {
    workspace = createWorkspaceTestHost();
    registerWorkspaceCommands(workspace.host, []);
    registerSectionKinds(workspace.host, {
      leaf: {
        renderContent: (section) => section.name,
        renderAttachedContent: (section) =>
          section.data === true
            ? createElement(
                "div",
                {
                  "data-testid": "attached-content",
                  "data-workspace-attached-section": "true",
                },
                "Attached runtime surface",
              )
            : null,
      },
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    workspace.host.dispose();
  });

  async function mount(data?: WorkspaceSection["data"]) {
    loadWorkspaceDocument(workspace.host, {
      activeIds: [],
      sections: {
        leaf: {
          children: [],
          data,
          id: "leaf",
          isHorizontalOrientation: false,
          isMinimized: false,
          kind: "leaf",
          name: "Leaf section",
          overflowMode: false,
          positionAndSizeLocked: false,
          size: { width: 224, height: 96 },
          styleColor: null,
          tagColor: null,
        },
      },
      topLevelSections: {
        leaf: { h: 96, w: 224, x: 0, y: 0, zIndex: 0 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    });
    await act(async () => {
      root.render(
        <WorkspaceTestProvider workspace={workspace}>
          <SectionDndContext>
            <SectionContainer sectionId="leaf" />
          </SectionDndContext>
        </WorkspaceTestProvider>,
      );
    });
  }

  it("joins attached content without changing the owner section size", async () => {
    await mount();

    const group = container.querySelector(
      "[data-workspace-joined-section-group]",
    );
    expect(group).not.toBeNull();
    expect(
      group?.querySelector("[data-workspace-attached-section]"),
    ).toBeNull();
    expect(group?.querySelector('[data-section-id="leaf"]')).not.toBeNull();
    expect(workspace.document.getState().sections.leaf?.size).toEqual({
      width: 224,
      height: 96,
    });

    await mount(true);

    const attachment = container.querySelector(
      '[data-testid="attached-content"]',
    );
    expect(attachment?.parentElement).toBe(group);
    expect(workspace.document.getState().sections.leaf?.size).toEqual({
      width: 224,
      height: 96,
    });
  });
});
