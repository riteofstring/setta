/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceCapabilities } from "../document/capabilities";
import { setWorkspaceDocumentChangeCallback } from "../document/documentChangeCallback";
import { loadWorkspaceDocument } from "../document/loadWorkspaceDocument";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import { useActiveSections, useNodeInternals, useWorkspaceDocument } from "../document/stores";
import { NO_PAN_CLASS_NAME } from "../interaction";
import { NodeWrapper } from "./wrapNode";

const useDragMock = vi.hoisted(() => vi.fn());

vi.mock("./useDrag", () => ({ default: useDragMock }));
vi.mock("../section/container/SectionContainer", () => ({
  SectionContainer: ({ sectionId }: { sectionId: string }) => sectionId,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function loadTestDocument() {
  registerSectionKinds({ leaf: { renderContent: () => null } });
  loadWorkspaceDocument({
    sections: {
      leaf: {
        id: "leaf",
        kind: "leaf",
        name: "Leaf",
        size: { width: 200, height: 100 },
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        tagColor: null,
        children: [],
      },
    },
    topLevelSections: { leaf: { x: 10, y: 20, w: 200, h: 100, zIndex: 0 } },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  });
}

describe("NodeWrapper", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useDragMock.mockClear();
    loadTestDocument();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    setWorkspaceDocumentChangeCallback(null);
    registerSectionKinds({});
    useWorkspaceCapabilities.getState().reset();
    useWorkspaceDocument.getState().reset();
    useNodeInternals.getState().reset();
    useActiveSections.getState().reset();
  });

  it("disables the top-level drag behavior when layout editing is unavailable", async () => {
    await act(async () => {
      root.render(
        createElement(NodeWrapper, {
          id: "leaf",
          isDraggable: true,
          resizeObserver: null,
          visibility: "visible",
        }),
      );
    });

    const node = host.querySelector<HTMLElement>(".react-flow__node");
    expect(node?.classList.contains(NO_PAN_CLASS_NAME)).toBe(true);
    expect(useDragMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: false, nodeId: "leaf" }),
    );

    await act(async () => useWorkspaceCapabilities.setState({ canEditLayout: false }));

    expect(node?.classList.contains(NO_PAN_CLASS_NAME)).toBe(false);
    expect(useDragMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: true, nodeId: "leaf" }),
    );
  });
});
